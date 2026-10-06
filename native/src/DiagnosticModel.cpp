#include "DiagnosticModel.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace miditest {

void RunningStats::push(int v) {
    if (count == 0) min = max = v; else { min = std::min(min, v); max = std::max(max, v); }
    ++count;
    const double delta = v - mean;
    mean += delta / static_cast<double>(count);
    m2 += delta * (v - mean);
}
double RunningStats::stdev() const { return count ? std::sqrt(m2 / static_cast<double>(count)) : 0.0; }
double ControlStats::coverage() const { return count ? (static_cast<double>(max - min) / 127.0) * 100.0 : 0.0; }

const char* kindName(EventKind k) {
    switch (k) {
        case EventKind::NoteOn: return "Note On"; case EventKind::NoteOff: return "Note Off";
        case EventKind::PolyPressure: return "Poly Pressure"; case EventKind::ControlChange: return "CC";
        case EventKind::ProgramChange: return "Program"; case EventKind::ChannelPressure: return "Channel Pressure";
        case EventKind::PitchBend: return "Pitch Bend"; case EventKind::Clock: return "Clock";
        case EventKind::Start: return "Start"; case EventKind::Continue: return "Continue";
        case EventKind::Stop: return "Stop"; case EventKind::SongPosition: return "Song Position";
        case EventKind::ActiveSense: return "Active Sense"; case EventKind::SysEx: return "SysEx";
        default: return "System";
    }
}

void DiagnosticModel::reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    history_.clear(); oneSecondTimes_.clear(); clockIntervals_.clear();
    messageCounts_.fill(0); channelCounts_.fill(0); controls_.fill({});
    for (auto& ch : activeNotes_) ch.fill(false);
    notesSeen_.fill(false); velocities_ = {}; channelPressure_ = {}; polyPressure_ = {}; pitchCenter_ = {};
    noteDurationsMs_ = {}; interOnsetMs_ = {}; lastNoteOnSeconds_ = -1.0;
    for (auto& ch : noteStart_) ch.fill(-1.0);
    parameterState_.fill({}); parameterEvents_.clear();
    for (auto& ch : lastCcValue_) ch.fill(0);
    for (auto& ch : lastCcSeen_) ch.fill(false);
    for (auto& ch : highResValue_) ch.fill(0);
    for (auto& ch : highResSeen_) ch.fill(false);
    totalEvents_ = duplicateNoteOns_ = unmatchedNoteOffs_ = 0; controlsSeen_ = 0;
    pitchMin_ = 8191; pitchMax_ = -8192; lastClock_ = -1.0; currentRate_ = peakRate_ = 0.0;
}

Event DiagnosticModel::decode(const uint8_t* data, size_t size, double seconds) {
    Event e; e.seconds = seconds; e.originalBytes = static_cast<uint32_t>(size);
    e.storedBytes = static_cast<uint16_t>(std::min<size_t>(size, e.bytes.size()));
    std::copy_n(data, e.storedBytes, e.bytes.begin());
    if (size == 0) return e;
    const uint8_t status = data[0];
    const int type = status & 0xF0;
    const int a = size > 1 ? data[1] : 0, b = size > 2 ? data[2] : 0;
    e.channel = (type >= 0x80 && type <= 0xE0) ? ((status & 0x0F) + 1) : 0;
    e.a = a; e.b = b; e.value = size > 2 ? b : a;
    if (status == 0xF0) { e.kind = EventKind::SysEx; e.value = static_cast<int>(size); }
    else if (status == 0xF2) { e.kind = EventKind::SongPosition; e.value = a | (b << 7); }
    else if (status == 0xF8) e.kind = EventKind::Clock;
    else if (status == 0xFA) e.kind = EventKind::Start;
    else if (status == 0xFB) e.kind = EventKind::Continue;
    else if (status == 0xFC) e.kind = EventKind::Stop;
    else if (status == 0xFE) e.kind = EventKind::ActiveSense;
    else if (type == 0x80 || (type == 0x90 && b == 0)) e.kind = EventKind::NoteOff;
    else if (type == 0x90) e.kind = EventKind::NoteOn;
    else if (type == 0xA0) e.kind = EventKind::PolyPressure;
    else if (type == 0xB0) e.kind = EventKind::ControlChange;
    else if (type == 0xC0) e.kind = EventKind::ProgramChange;
    else if (type == 0xD0) e.kind = EventKind::ChannelPressure;
    else if (type == 0xE0) { e.kind = EventKind::PitchBend; e.value = ((b << 7) | a) - 8192; }
    return e;
}

void DiagnosticModel::updateRate(double seconds) {
    oneSecondTimes_.push_back(seconds);
    while (!oneSecondTimes_.empty() && seconds - oneSecondTimes_.front() > 1.0) oneSecondTimes_.pop_front();
    currentRate_ = static_cast<double>(oneSecondTimes_.size());
    peakRate_ = std::max(peakRate_, currentRate_);
}

void DiagnosticModel::ingest(const uint8_t* data, size_t size, double seconds) {
    if (data == nullptr || size == 0) return;
    const Event e = decode(data, size, seconds);
    std::lock_guard<std::mutex> lock(mutex_);
    ++totalEvents_; ++messageCounts_[kindIndex(e.kind)];
    if (e.channel >= 1 && e.channel <= 16) ++channelCounts_[static_cast<size_t>(e.channel - 1)];
    updateRate(seconds);

    const bool validDataIndex = e.a >= 0 && e.a <= 127 && e.channel >= 1 && e.channel <= 16;
    if (e.kind == EventKind::NoteOn && validDataIndex) {
        notesSeen_[static_cast<size_t>(e.a)] = true;
        auto& active = activeNotes_[static_cast<size_t>(e.channel - 1)][static_cast<size_t>(e.a)];
        if (active) ++duplicateNoteOns_;
        active = true; velocities_.push(e.b);
        auto& start = noteStart_[static_cast<size_t>(e.channel - 1)][static_cast<size_t>(e.a)];
        start = seconds;
        if (lastNoteOnSeconds_ >= 0.0) interOnsetMs_.push(static_cast<int>(std::lround((seconds - lastNoteOnSeconds_) * 1000.0)));
        lastNoteOnSeconds_ = seconds;
    } else if (e.kind == EventKind::NoteOff && validDataIndex) {
        auto& active = activeNotes_[static_cast<size_t>(e.channel - 1)][static_cast<size_t>(e.a)];
        auto& start = noteStart_[static_cast<size_t>(e.channel - 1)][static_cast<size_t>(e.a)];
        if (!active) ++unmatchedNoteOffs_;
        else if (start >= 0.0) noteDurationsMs_.push(static_cast<int>(std::lround((seconds - start) * 1000.0)));
        active = false; start = -1.0;
    } else if (e.kind == EventKind::ControlChange && validDataIndex) {
        auto& c = controls_[static_cast<size_t>((e.channel - 1) * 128 + e.a)];
        if (c.count == 0) { ++controlsSeen_; c.min = c.max = e.value; }
        else {
            const int delta = e.value - c.last;
            if (delta == 0) ++c.repeated;
            if (std::abs(delta) > 12) ++c.jumps;
            const int direction = (delta > 0) - (delta < 0);
            if (direction != 0 && c.lastDirection != 0 && direction != c.lastDirection) ++c.reversals;
            if (direction != 0) c.lastDirection = direction;
            c.min = std::min(c.min, e.value); c.max = std::max(c.max, e.value);
        }
        ++c.count; c.last = e.value; c.unique.set(static_cast<size_t>(std::clamp(e.value, 0, 127))); c.recent.push(e.value);

        const auto chIndex = static_cast<size_t>(e.channel - 1);
        lastCcValue_[chIndex][static_cast<size_t>(e.a)] = e.value;
        lastCcSeen_[chIndex][static_cast<size_t>(e.a)] = true;
        if (e.a >= 32 && e.a <= 63) {
            const int msb = e.a - 32;
            if (lastCcSeen_[chIndex][static_cast<size_t>(msb)]) {
                highResValue_[chIndex][static_cast<size_t>(msb)] = (lastCcValue_[chIndex][static_cast<size_t>(msb)] << 7) | e.value;
                highResSeen_[chIndex][static_cast<size_t>(msb)] = true;
            }
        }

        auto& ps = parameterState_[chIndex];
        if (e.a == 99) { ps.mode = 1; ps.msb = e.value; }
        else if (e.a == 98) { ps.mode = 1; ps.lsb = e.value; }
        else if (e.a == 101) { ps.mode = 2; ps.msb = e.value; }
        else if (e.a == 100) { ps.mode = 2; ps.lsb = e.value; }
        else if (e.a == 6) ps.dataMsb = e.value;
        else if (e.a == 38) ps.dataLsb = e.value;
        if (ps.mode != 0 && ps.msb >= 0 && ps.lsb >= 0 && (e.a == 6 || e.a == 38 || e.a == 96 || e.a == 97)) {
            ParamEvent pe; pe.nrpn = ps.mode == 1; pe.channel = e.channel; pe.parameter = (ps.msb << 7) | ps.lsb;
            pe.value14 = (ps.dataMsb << 7) | ps.dataLsb; pe.delta = e.a == 96 ? 1 : (e.a == 97 ? -1 : 0); pe.seconds = seconds;
            parameterEvents_.push_back(pe); if (parameterEvents_.size() > 128) parameterEvents_.pop_front();
        }
    } else if (e.kind == EventKind::ChannelPressure) {
        channelPressure_.push(e.value);
    } else if (e.kind == EventKind::PolyPressure) {
        polyPressure_.push(e.value);
    } else if (e.kind == EventKind::PitchBend) {
        pitchMin_ = std::min(pitchMin_, e.value); pitchMax_ = std::max(pitchMax_, e.value);
        if (std::abs(e.value) < 1024) pitchCenter_.push(e.value);
    } else if (e.kind == EventKind::Clock) {
        if (lastClock_ >= 0.0) {
            const double d = seconds - lastClock_;
            if (d > 0.0 && d < 0.5) {
                clockIntervals_.push_back(d);
                if (clockIntervals_.size() > 256) clockIntervals_.pop_front();
            }
        }
        lastClock_ = seconds;
    }

    history_.push_back(e);
    if (history_.size() > maxHistory) history_.pop_front();
}

Snapshot DiagnosticModel::snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    Snapshot s; s.totalEvents = totalEvents_; s.historyEvents = history_.size(); s.messageCounts = messageCounts_; s.channelCounts = channelCounts_;
    s.notesSeen = notesSeen_; s.duplicateNoteOns = duplicateNoteOns_; s.unmatchedNoteOffs = unmatchedNoteOffs_; s.controlsSeen = controlsSeen_;
    for (size_t note = 0; note < 128; ++note) for (size_t ch = 0; ch < 16; ++ch) if (activeNotes_[ch][note]) s.heldNotes[note] = true;
    s.pitchMin = pitchMin_ == 8191 ? 0 : pitchMin_; s.pitchMax = pitchMax_ == -8192 ? 0 : pitchMax_;
    s.pitchCenterMean = pitchCenter_.mean; s.pitchCenterStdev = pitchCenter_.stdev(); s.currentRate = currentRate_; s.peakRate = peakRate_;
    if (velocities_.count) { s.velocityMin = velocities_.min; s.velocityMax = velocities_.max; s.velocityMean = velocities_.mean; s.velocityStdev = velocities_.stdev(); }
    if (channelPressure_.count) { s.channelPressureMin = channelPressure_.min; s.channelPressureMax = channelPressure_.max; s.channelPressureMean = channelPressure_.mean; s.channelPressureStdev = channelPressure_.stdev(); }
    if (polyPressure_.count) { s.polyPressureMin = polyPressure_.min; s.polyPressureMax = polyPressure_.max; s.polyPressureMean = polyPressure_.mean; s.polyPressureStdev = polyPressure_.stdev(); }
    s.noteDurationMeanMs = noteDurationsMs_.mean; s.noteDurationStdevMs = noteDurationsMs_.stdev(); s.interOnsetMeanMs = interOnsetMs_.mean;
    s.parameterEvents = parameterEvents_.size();
    for (const auto& ch : highResSeen_) for (bool seen : ch) if (seen) ++s.highResolutionPairs;
    if (!clockIntervals_.empty()) {
        auto v = std::vector<double>(clockIntervals_.begin(), clockIntervals_.end());
        const auto mid = v.begin() + static_cast<std::ptrdiff_t>(v.size() / 2); std::nth_element(v.begin(), mid, v.end());
        s.clockBpm = 60.0 / (*mid * 24.0);
    }
    return s;
}

ControlStats DiagnosticModel::control(int channel, int cc) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (channel < 1 || channel > 16 || cc < 0 || cc > 127) return {};
    return controls_[static_cast<size_t>((channel - 1) * 128 + cc)];
}
std::vector<Event> DiagnosticModel::eventsCopy() const { std::lock_guard<std::mutex> lock(mutex_); return {history_.begin(), history_.end()}; }

static std::string jsonEscape(const std::string& s) {
    std::ostringstream o; for (char c : s) { if (c == '"' || c == '\\') o << '\\' << c; else if (c == '\n') o << "\\n"; else o << c; } return o.str();
}
std::string DiagnosticModel::reportJson(const std::string& device, const std::string& mode) const {
    const auto s = snapshot(); std::ostringstream o; o << std::fixed << std::setprecision(3);
    o << "{\n  \"version\": 2,\n  \"mode\": \"" << jsonEscape(mode) << "\",\n  \"device\": \"" << jsonEscape(device) << "\",";
    o << "\n  \"events\": " << s.totalEvents << ",\n  \"historyEvents\": " << s.historyEvents << ",\n  \"controlsSeen\": " << s.controlsSeen;
    o << ",\n  \"duplicateNoteOns\": " << s.duplicateNoteOns << ",\n  \"unmatchedNoteOffs\": " << s.unmatchedNoteOffs;
    o << ",\n  \"velocity\": {\"min\": " << s.velocityMin << ", \"max\": " << s.velocityMax << ", \"mean\": " << s.velocityMean << ", \"stdev\": " << s.velocityStdev << "}";
    o << ",\n  \"aftertouch\": {\"channelMin\": " << s.channelPressureMin << ", \"channelMax\": " << s.channelPressureMax << ", \"channelMean\": " << s.channelPressureMean << ", \"channelStdev\": " << s.channelPressureStdev << ", \"polyMin\": " << s.polyPressureMin << ", \"polyMax\": " << s.polyPressureMax << ", \"polyMean\": " << s.polyPressureMean << ", \"polyStdev\": " << s.polyPressureStdev << "}";
    o << ",\n  \"timing\": {\"noteDurationMeanMs\": " << s.noteDurationMeanMs << ", \"noteDurationStdevMs\": " << s.noteDurationStdevMs << ", \"interOnsetMeanMs\": " << s.interOnsetMeanMs << "}";
    o << ",\n  \"pitch\": {\"min\": " << s.pitchMin << ", \"max\": " << s.pitchMax << ", \"centerMean\": " << s.pitchCenterMean << ", \"centerStdev\": " << s.pitchCenterStdev << "}";
    o << ",\n  \"clockBpm\": " << s.clockBpm << ",\n  \"messageRate\": {\"current\": " << s.currentRate << ", \"peak\": " << s.peakRate << "}";
    o << ",\n  \"parameterEvents\": " << s.parameterEvents << ",\n  \"highResolutionPairs\": " << s.highResolutionPairs;

    std::lock_guard<std::mutex> lock(mutex_);
    o << ",\n  \"notesSeen\": [";
    bool first = true; for (size_t n = 0; n < notesSeen_.size(); ++n) if (notesSeen_[n]) { if (!first) o << ','; o << n; first = false; }
    o << "],\n  \"channels\": {";
    first = true; for (size_t ch = 0; ch < channelCounts_.size(); ++ch) if (channelCounts_[ch]) { if (!first) o << ','; o << "\"" << (ch + 1) << "\":" << channelCounts_[ch]; first = false; }
    o << "},\n  \"messageCounts\": {";
    first = true; for (size_t i = 0; i < messageCounts_.size(); ++i) if (messageCounts_[i]) { if (!first) o << ','; o << "\"" << kindName(static_cast<EventKind>(i)) << "\":" << messageCounts_[i]; first = false; }
    o << "},\n  \"controls\": [";
    first = true;
    for (int ch = 1; ch <= 16; ++ch) for (int cc = 0; cc < 128; ++cc) {
        const auto& ctl = controls_[static_cast<size_t>((ch - 1) * 128 + cc)];
        if (!ctl.count) continue;
        if (!first) o << ',';
        o << "{\"channel\":" << ch << ",\"cc\":" << cc << ",\"count\":" << ctl.count << ",\"min\":" << ctl.min << ",\"max\":" << ctl.max << ",\"coverage\":" << ctl.coverage() << ",\"unique\":" << ctl.unique.count() << ",\"repeated\":" << ctl.repeated << ",\"jumps\":" << ctl.jumps << ",\"reversals\":" << ctl.reversals << ",\"stdev\":" << ctl.recent.stdev() << "}";
        first = false;
    }
    o << "],\n  \"highResolution\": [";
    first = true;
    for (int ch = 0; ch < 16; ++ch) for (int msb = 0; msb < 32; ++msb) if (highResSeen_[static_cast<size_t>(ch)][static_cast<size_t>(msb)]) {
        if (!first) o << ','; o << "{\"channel\":" << (ch + 1) << ",\"msbCc\":" << msb << ",\"lsbCc\":" << (msb + 32) << ",\"value14\":" << highResValue_[static_cast<size_t>(ch)][static_cast<size_t>(msb)] << "}"; first = false;
    }
    o << "],\n  \"parameters\": [";
    first = true; for (const auto& pe : parameterEvents_) { if (!first) o << ','; o << "{\"type\":\"" << (pe.nrpn ? "NRPN" : "RPN") << "\",\"channel\":" << pe.channel << ",\"parameter\":" << pe.parameter << ",\"value14\":" << pe.value14 << ",\"delta\":" << pe.delta << "}"; first = false; }
    o << "]\n}\n"; return o.str();
}
std::string DiagnosticModel::captureCsv() const {
    const auto events = eventsCopy(); std::ostringstream o; o << "seconds,type,channel,a,b,value,bytes\n";
    for (const auto& e : events) {
        o << std::fixed << std::setprecision(6) << e.seconds << ',' << kindName(e.kind) << ',' << e.channel << ',' << e.a << ',' << e.b << ',' << e.value << ",\"";
        for (uint16_t i = 0; i < e.storedBytes; ++i) { if (i) o << ' '; o << std::hex << std::uppercase << std::setw(2) << std::setfill('0') << static_cast<int>(e.bytes[i]); }
        o << std::dec << "\"\n";
    }
    return o.str();
}

} // namespace miditest

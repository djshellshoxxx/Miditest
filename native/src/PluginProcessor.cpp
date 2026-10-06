#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <algorithm>
#include <cstring>

MidiTestProcessor::MidiTestProcessor() : juce::AudioProcessor(BusesProperties()) {
    startTimerHz(30);
}

void MidiTestProcessor::prepareToPlay(double sampleRate, int) {
    sampleRate_ = sampleRate > 0.0 ? sampleRate : 44100.0;
    streamSeconds_ = 0.0;
}

void MidiTestProcessor::processBlock(juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) {
    audio.clear();
    const auto blockStart = streamSeconds_;
    if (loopbackResetRequested_.exchange(false)) {
        for (auto& p : loopbackProbes_) p = {};
        loopbackSent_.store(0); loopbackMatched_.store(0); loopbackMissing_.store(0);
        loopbackLatencySumMs_.store(0.0); loopbackLatencyMinMs_.store(0.0); loopbackLatencyMaxMs_.store(0.0);
        loopbackLastSentSeconds_ = -1.0;
        loopbackActive_.store(true);
    }
    for (const auto metadata : midi) {
        const auto msg = metadata.getMessage();
        const auto* raw = msg.getRawData();
        const auto size = static_cast<uint32_t>(msg.getRawDataSize());
        handleLoopbackInput(raw, static_cast<int>(size), blockStart + static_cast<double>(metadata.samplePosition) / sampleRate_);
        auto scope = inputFifo_.write(1);
        if (scope.blockSize1 > 0) {
            auto& q = inputQueue_[static_cast<size_t>(scope.startIndex1)];
            q.seconds = blockStart + static_cast<double>(metadata.samplePosition) / sampleRate_;
            q.originalSize = size;
            q.storedSize = static_cast<uint16_t>(std::min<uint32_t>(size, static_cast<uint32_t>(q.bytes.size())));
            if (q.storedSize) std::memcpy(q.bytes.data(), raw, q.storedSize);
        } else {
            ++droppedInput_;
        }
    }

    for (;;) {
        auto scope = outputFifo_.read(1);
        if (scope.blockSize1 == 0) break;
        const auto& e = outputQueue_[static_cast<size_t>(scope.startIndex1)];
        midi.addEvent(e.bytes.data(), e.size, 0);
        if (e.probeId >= 0 && e.probeId < static_cast<int>(loopbackProbes_.size())) {
            auto& p = loopbackProbes_[static_cast<size_t>(e.probeId)];
            p.size = e.size; p.bytes = e.bytes; p.sentSeconds = blockStart; p.matched = false;
            loopbackLastSentSeconds_ = blockStart;
            loopbackSent_.fetch_add(1);
        }
    }
    if (loopbackActive_.load() && loopbackSent_.load() == static_cast<int>(loopbackProbes_.size()) &&
        loopbackLastSentSeconds_ >= 0.0 && blockStart - loopbackLastSentSeconds_ > 1.0) {
        loopbackMissing_.store(loopbackSent_.load() - loopbackMatched_.load());
        loopbackActive_.store(false);
    }
    streamSeconds_ += static_cast<double>(audio.getNumSamples()) / sampleRate_;
}

void MidiTestProcessor::timerCallback() {
    for (;;) {
        auto scope = inputFifo_.read(256);
        if (scope.blockSize1 + scope.blockSize2 == 0) break;
        auto consume = [this](int start, int count) {
            for (int i = 0; i < count; ++i) {
                const auto& q = inputQueue_[static_cast<size_t>(start + i)];
                model_.ingest(q.bytes.data(), q.storedSize, q.seconds);
            }
        };
        consume(scope.startIndex1, scope.blockSize1);
        consume(scope.startIndex2, scope.blockSize2);
    }
}

void MidiTestProcessor::resetDiagnostics() {
    model_.reset();
    droppedInput_.store(0);
    droppedOutput_.store(0);
}

void MidiTestProcessor::queueShortMessage(uint8_t status, uint8_t a, uint8_t b, uint8_t size) {
    auto scope = outputFifo_.write(1);
    if (scope.blockSize1 == 0) { ++droppedOutput_; return; }
    auto& e = outputQueue_[static_cast<size_t>(scope.startIndex1)];
    e.size = static_cast<uint8_t>(juce::jlimit(1, 3, static_cast<int>(size)));
    e.probeId = -1;
    e.bytes = {status, a, b};
}

void MidiTestProcessor::queueProbeMessage(int probeId, uint8_t status, uint8_t a, uint8_t b, uint8_t size) {
    auto scope = outputFifo_.write(1);
    if (scope.blockSize1 == 0) { ++droppedOutput_; return; }
    auto& e = outputQueue_[static_cast<size_t>(scope.startIndex1)];
    e.size = static_cast<uint8_t>(juce::jlimit(1, 3, static_cast<int>(size)));
    e.probeId = static_cast<int8_t>(probeId);
    e.bytes = {status, a, b};
}

void MidiTestProcessor::sendNote(int channel, int note, int velocity, bool on) {
    const auto ch = static_cast<uint8_t>(juce::jlimit(1,16,channel)-1);
    queueShortMessage(static_cast<uint8_t>((on ? 0x90 : 0x80) | ch),
                      static_cast<uint8_t>(juce::jlimit(0,127,note)),
                      static_cast<uint8_t>(on ? juce::jlimit(0,127,velocity) : 0), 3);
}
void MidiTestProcessor::sendCC(int channel, int cc, int value) {
    queueShortMessage(static_cast<uint8_t>(0xB0 | (juce::jlimit(1,16,channel)-1)),
                      static_cast<uint8_t>(juce::jlimit(0,127,cc)),
                      static_cast<uint8_t>(juce::jlimit(0,127,value)), 3);
}
void MidiTestProcessor::sendProgram(int channel, int program) {
    queueShortMessage(static_cast<uint8_t>(0xC0 | (juce::jlimit(1,16,channel)-1)),
                      static_cast<uint8_t>(juce::jlimit(0,127,program)), 0, 2);
}
void MidiTestProcessor::sendPitchBend(int channel, int value) {
    const int v = juce::jlimit(-8192,8191,value)+8192;
    queueShortMessage(static_cast<uint8_t>(0xE0 | (juce::jlimit(1,16,channel)-1)),
                      static_cast<uint8_t>(v & 0x7F), static_cast<uint8_t>((v >> 7) & 0x7F), 3);
}
void MidiTestProcessor::panicAll() {
    for (int ch=1; ch<=16; ++ch) { sendCC(ch,120,0); sendCC(ch,121,0); sendCC(ch,123,0); }
}

void MidiTestProcessor::startLoopbackTest() {
    loopbackResetRequested_.store(true);
    queueProbeMessage(0,0x90,60,37,3);
    queueProbeMessage(1,0x80,60,0,3);
    queueProbeMessage(2,0xB0,21,17,3);
    queueProbeMessage(3,0xC0,9,0,2);
    queueProbeMessage(4,0xE0,0,64,3);
    queueProbeMessage(5,0xB0,21,103,3);
}

void MidiTestProcessor::handleLoopbackInput(const uint8_t* data, int size, double seconds) {
    if (!loopbackActive_.load() || data == nullptr) return;
    for (auto& p : loopbackProbes_) {
        if (p.matched || p.sentSeconds < 0.0 || p.size != size) continue;
        bool exact = true;
        for (int i=0; i<size; ++i) if (p.bytes[static_cast<size_t>(i)] != data[i]) { exact=false; break; }
        if (!exact) continue;
        p.matched = true;
        const double ms = juce::jmax(0.0, (seconds - p.sentSeconds) * 1000.0);
        const int matched = loopbackMatched_.fetch_add(1) + 1;
        loopbackLatencySumMs_.fetch_add(ms);
        if (matched == 1) { loopbackLatencyMinMs_.store(ms); loopbackLatencyMaxMs_.store(ms); }
        else {
            double cur = loopbackLatencyMinMs_.load(); while (ms < cur && !loopbackLatencyMinMs_.compare_exchange_weak(cur, ms)) {}
            cur = loopbackLatencyMaxMs_.load(); while (ms > cur && !loopbackLatencyMaxMs_.compare_exchange_weak(cur, ms)) {}
        }
        if (matched == static_cast<int>(loopbackProbes_.size())) { loopbackMissing_.store(0); loopbackActive_.store(false); }
        break;
    }
}

MidiTestProcessor::LoopbackSnapshot MidiTestProcessor::loopbackSnapshot() const {
    LoopbackSnapshot s; s.sent=loopbackSent_.load(); s.matched=loopbackMatched_.load(); s.missing=loopbackMissing_.load();
    s.minMs=loopbackLatencyMinMs_.load(); s.maxMs=loopbackLatencyMaxMs_.load();
    s.meanMs=s.matched ? loopbackLatencySumMs_.load()/static_cast<double>(s.matched) : 0.0; s.active=loopbackActive_.load(); return s;
}

juce::AudioProcessorEditor* MidiTestProcessor::createEditor() { return new MidiTestEditor(*this); }
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new MidiTestProcessor(); }

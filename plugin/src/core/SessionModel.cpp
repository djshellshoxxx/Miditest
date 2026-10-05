#include "SessionModel.h"

#include <algorithm>

namespace miditest
{
SessionModel::SessionModel(std::size_t capacity) : historyCapacity(std::max<std::size_t>(1, capacity)) {}

std::size_t SessionModel::typeIndex(MidiMessageType type) noexcept
{
    return static_cast<std::size_t>(type);
}

void SessionModel::ingest(const DecodedMidiEvent& event)
{
    ++totalEventCount;
    lastEventTime = std::max(lastEventTime, event.sessionSeconds);
    if (typeIndex(event.type) < typeCounts.size())
        ++typeCounts[typeIndex(event.type)];
    if (event.channel > 0)
        channels.insert(event.channel);

    history.push_back(event);
    while (history.size() > historyCapacity)
        history.pop_front();

    messageTimes.push_back(event.sessionSeconds);
    while (messageTimes.size() > 2048)
        messageTimes.pop_front();
    while (!messageTimes.empty() && event.sessionSeconds - messageTimes.front() > 1.0)
        messageTimes.pop_front();
    const double currentRate = static_cast<double>(messageTimes.size());
    peakMessageRate = std::max(peakMessageRate, currentRate);

    switch (event.type)
    {
        case MidiMessageType::noteOn:
            heldNotes.insert(event.identifier);
            ++noteOnCount;
            break;
        case MidiMessageType::noteOff:
            heldNotes.erase(event.identifier);
            ++noteOffCount;
            break;
        case MidiMessageType::controlChange:
        {
            auto& control = controls[controlKey(event.channel, event.identifier)];
            control.currentValue = event.value;
            control.values.push_back(event.value);
            while (control.values.size() > 256)
                control.values.pop_front();
            break;
        }
        case MidiMessageType::pitchBend:
            pitchValues.push_back(event.value);
            while (pitchValues.size() > 1024)
                pitchValues.pop_front();
            break;
        case MidiMessageType::clock:
            clockTimes.push_back(event.sessionSeconds);
            while (clockTimes.size() > 256)
                clockTimes.pop_front();
            break;
        case MidiMessageType::start: sawStart = true; break;
        case MidiMessageType::continueMessage: sawContinue = true; break;
        case MidiMessageType::stop: sawStop = true; break;
        default: break;
    }
}

SessionSnapshot SessionModel::getSnapshot() const
{
    SessionSnapshot out;
    out.totalEventCount = totalEventCount;
    out.history.assign(history.begin(), history.end());
    out.typeCounts = typeCounts;
    out.channels = channels;
    out.heldNotes = heldNotes;
    out.noteOnCount = noteOnCount;
    out.noteOffCount = noteOffCount;
    out.peakMessageRate = peakMessageRate;
    out.sawStart = sawStart;
    out.sawContinue = sawContinue;
    out.sawStop = sawStop;
    out.sessionDurationSeconds = lastEventTime;

    const std::vector<int> pitch(pitchValues.begin(), pitchValues.end());
    out.pitch = analyzePitch(pitch);
    const std::vector<double> clock(clockTimes.begin(), clockTimes.end());
    out.clockBpm = calculateClockBpm(clock);
    const std::vector<double> rates(messageTimes.begin(), messageTimes.end());
    out.messageRate = calculateMessageRate(rates, 1.0);

    out.controls.reserve(controls.size());
    for (const auto& [key, historyData] : controls)
    {
        ControlSnapshot control;
        control.channel = key / 128;
        control.controller = key % 128;
        control.currentValue = historyData.currentValue;
        control.recentValues.assign(historyData.values.begin(), historyData.values.end());
        control.stats = analyzeControl(control.recentValues);
        control.encoderClass = classifyEncoder(control.recentValues);
        out.controls.push_back(std::move(control));
    }
    return out;
}

void SessionModel::clearDisplayHistory()
{
    history.clear();
}

void SessionModel::resetSession()
{
    history.clear();
    totalEventCount = 0;
    typeCounts.fill(0);
    channels.clear();
    heldNotes.clear();
    noteOnCount = 0;
    noteOffCount = 0;
    controls.clear();
    pitchValues.clear();
    clockTimes.clear();
    messageTimes.clear();
    peakMessageRate = 0.0;
    sawStart = sawContinue = sawStop = false;
    lastEventTime = 0.0;
}
}

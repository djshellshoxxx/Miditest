#pragma once

#include "ClockAnalyzer.h"
#include "ControlAnalyzer.h"
#include "MidiEvent.h"
#include "PitchAnalyzer.h"

#include <array>
#include <cstdint>
#include <deque>
#include <map>
#include <set>
#include <vector>

namespace miditest
{
struct ControlSnapshot
{
    int channel = 0;
    int controller = 0;
    int currentValue = 0;
    ControlStats stats;
    juce::String encoderClass;
    std::vector<int> recentValues;
};

struct SessionSnapshot
{
    std::uint64_t totalEventCount = 0;
    std::vector<DecodedMidiEvent> history;
    std::array<std::uint64_t, 14> typeCounts {};
    std::set<int> channels;
    std::set<int> heldNotes;
    std::uint64_t noteOnCount = 0;
    std::uint64_t noteOffCount = 0;
    std::vector<ControlSnapshot> controls;
    PitchStats pitch;
    std::optional<double> clockBpm;
    double messageRate = 0.0;
    double peakMessageRate = 0.0;
    bool sawStart = false;
    bool sawContinue = false;
    bool sawStop = false;
    double sessionDurationSeconds = 0.0;
};

class SessionModel
{
public:
    explicit SessionModel(std::size_t historyCapacity = 5000);

    void ingest(const DecodedMidiEvent& event);
    SessionSnapshot getSnapshot() const;
    void clearDisplayHistory();
    void resetSession();

private:
    struct ControlHistory
    {
        int currentValue = 0;
        std::deque<int> values;
    };

    static std::size_t typeIndex(MidiMessageType type) noexcept;
    static int controlKey(int channel, int controller) noexcept { return channel * 128 + controller; }

    std::size_t historyCapacity;
    std::deque<DecodedMidiEvent> history;
    std::uint64_t totalEventCount = 0;
    std::array<std::uint64_t, 14> typeCounts {};
    std::set<int> channels;
    std::set<int> heldNotes;
    std::uint64_t noteOnCount = 0;
    std::uint64_t noteOffCount = 0;
    std::map<int, ControlHistory> controls;
    std::deque<int> pitchValues;
    std::deque<double> clockTimes;
    std::deque<double> messageTimes;
    double peakMessageRate = 0.0;
    bool sawStart = false;
    bool sawContinue = false;
    bool sawStop = false;
    double lastEventTime = 0.0;
};
}

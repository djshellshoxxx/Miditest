#pragma once

#include <JuceHeader.h>
#include "MidiEvent.h"
#include <map>
#include <optional>
#include <vector>

namespace miditest
{
struct MappingKey
{
    MidiMessageType type = MidiMessageType::system;
    int channel = 0;
    int identifier = -1;

    bool operator<(const MappingKey& other) const noexcept
    {
        if (type != other.type) return static_cast<int>(type) < static_cast<int>(other.type);
        if (channel != other.channel) return channel < other.channel;
        return identifier < other.identifier;
    }
};

struct MappingEntry
{
    MappingKey key;
    juce::String hardwareLabel;
    juce::String assignment;
};

struct MappingSnapshot
{
    std::vector<MappingEntry> entries;
};

struct LearnResult
{
    MidiMessageType type = MidiMessageType::system;
    int channel = 0;
    int identifier = -1;
    int value = 0;
};

class MappingModel
{
public:
    void beginLearn(bool includeSystemTraffic = false) noexcept;
    void cancelLearn() noexcept;
    void observe(const DecodedMidiEvent& event);
    std::optional<LearnResult> consumeLearnResult();

    void upsert(const MappingEntry& entry);
    bool erase(const MappingKey& key);
    void clear();
    MappingSnapshot snapshot() const;

    juce::ValueTree toValueTree() const;
    void restoreFromValueTree(const juce::ValueTree& tree);

private:
    bool learning = false;
    bool learnSystemTraffic = false;
    std::optional<LearnResult> pendingLearnResult;
    std::map<MappingKey, MappingEntry> entries;
};
}

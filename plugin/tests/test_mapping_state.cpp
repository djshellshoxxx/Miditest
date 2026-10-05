#include <JuceHeader.h>
#include "PluginProcessor.h"
#include "core/MappingModel.h"
#include <iostream>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

static miditest::DecodedMidiEvent event(miditest::MidiMessageType type, int channel, int id, int value)
{
    miditest::DecodedMidiEvent e;
    e.type = type;
    e.channel = channel;
    e.identifier = id;
    e.value = value;
    return e;
}

int main()
{
    using namespace miditest;
    MappingModel mapping;
    mapping.beginLearn();
    mapping.observe(event(MidiMessageType::clock, 0, -1, 0));
    CHECK(!mapping.consumeLearnResult().has_value());
    mapping.observe(event(MidiMessageType::activeSense, 0, -1, 0));
    CHECK(!mapping.consumeLearnResult().has_value());
    mapping.observe(event(MidiMessageType::controlChange, 1, 74, 99));
    auto learned = mapping.consumeLearnResult();
    CHECK(learned.has_value());
    CHECK(learned->channel == 1 && learned->identifier == 74 && learned->value == 99);

    MidiTestAudioProcessor source;
    MappingEntry entry;
    entry.key = { MidiMessageType::controlChange, 1, 74 };
    entry.hardwareLabel = "Knob 1";
    entry.assignment = "Filter Cutoff";
    source.getMappingModel().upsert(entry);
    source.setUiPreference("channelFilter", 3);
    source.setUiPreference("monitorPaused", true);

    juce::MemoryBlock state;
    source.getStateInformation(state);
    CHECK(state.getSize() > 0);

    MidiTestAudioProcessor restored;
    restored.setStateInformation(state.getData(), static_cast<int>(state.getSize()));
    const auto snapshot = restored.getMappingModel().snapshot();
    CHECK(snapshot.entries.size() == 1);
    CHECK(snapshot.entries[0].hardwareLabel == "Knob 1");
    CHECK(snapshot.entries[0].assignment == "Filter Cutoff");
    CHECK(static_cast<int>(restored.getUiPreference("channelFilter", 0)) == 3);
    CHECK(static_cast<bool>(restored.getUiPreference("monitorPaused", false)));

    const char garbage[] = "not a state";
    restored.setStateInformation(garbage, static_cast<int>(sizeof(garbage)));
    CHECK(restored.getMappingModel().snapshot().entries.size() == 1);

    return failures == 0 ? 0 : 1;
}

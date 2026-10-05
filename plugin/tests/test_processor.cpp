#include <JuceHeader.h>
#include "PluginProcessor.h"
#include "core/MidiEvent.h"
#include <cmath>
#include <iostream>
#include <vector>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

int main()
{
    using namespace miditest;
    MidiTestAudioProcessor processor;
    processor.prepareToPlay(48000.0, 128);

    juce::AudioBuffer<float> audio(2, 128);
    for (int c = 0; c < audio.getNumChannels(); ++c)
        for (int i = 0; i < audio.getNumSamples(); ++i)
            audio.setSample(c, i, static_cast<float>((c + 1) * 0.1 + i * 0.001));
    juce::AudioBuffer<float> before;
    before.makeCopyOf(audio);

    juce::MidiBuffer midi;
    const juce::uint8 zeroOn[] { 0x90, 60, 0 };
    midi.addEvent(juce::MidiMessage::noteOn(1, 64, (juce::uint8)100), 7);
    midi.addEvent(juce::MidiMessage(zeroOn, 3), 23);
    const auto midiBefore = midi;

    processor.processBlock(audio, midi);
    for (int c = 0; c < audio.getNumChannels(); ++c)
        for (int i = 0; i < audio.getNumSamples(); ++i)
            CHECK(audio.getSample(c, i) == before.getSample(c, i));

    auto a = midi.begin();
    auto b = midiBefore.begin();
    for (; a != midi.end() && b != midiBefore.end(); ++a, ++b)
    {
        CHECK(a->samplePosition == b->samplePosition);
        CHECK(a->getMessage().getRawDataSize() == b->getMessage().getRawDataSize());
        CHECK(std::memcmp(a->getMessage().getRawData(), b->getMessage().getRawData(), static_cast<size_t>(a->getMessage().getRawDataSize())) == 0);
    }
    CHECK(a == midi.end() && b == midiBefore.end());

    DecodedMidiEvent event;
    CHECK(processor.tryPopEvent(event));
    CHECK(event.type == MidiMessageType::noteOn);
    CHECK(processor.tryPopEvent(event));
    CHECK(event.type == MidiMessageType::noteOff && event.status == 0x90);

    juce::AudioBuffer<float> noAudio(0, 64);
    juce::MidiBuffer midiOnly;
    midiOnly.addEvent(juce::MidiMessage::controllerEvent(1, 74, 55), 2);
    processor.processBlock(noAudio, midiOnly);
    CHECK(midiOnly.getNumEvents() == 1);

    juce::MidiBuffer burst;
    for (int i = 0; i < 5000; ++i)
        burst.addEvent(juce::MidiMessage::controllerEvent(1, 1, i & 127), i % 128);
    const auto burstCount = burst.getNumEvents();
    processor.processBlock(audio, burst);
    CHECK(burst.getNumEvents() == burstCount);
    CHECK(processor.getDroppedAnalysisEventCount() > 0);

    return failures == 0 ? 0 : 1;
}

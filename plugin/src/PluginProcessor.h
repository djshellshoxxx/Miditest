#pragma once

#include <JuceHeader.h>
#include <atomic>
#include <cstdint>
#include "core/EventQueue.h"
#include "core/MidiEvent.h"

class MidiTestAudioProcessor final : public juce::AudioProcessor
{
public:
    MidiTestAudioProcessor();
    ~MidiTestAudioProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    bool tryPopEvent(miditest::DecodedMidiEvent&) noexcept;
    std::uint64_t getDroppedAnalysisEventCount() const noexcept { return droppedAnalysisEvents.load(std::memory_order_relaxed); }

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "MIDItest"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

private:
    miditest::SpscEventQueue<miditest::DecodedMidiEvent, 2048> eventQueue;
    std::atomic<std::uint64_t> droppedAnalysisEvents { 0 };
    std::uint64_t processedSamples = 0;
    double currentSampleRate = 44100.0;
};

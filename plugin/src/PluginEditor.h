#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

class MidiTestAudioProcessorEditor final : public juce::AudioProcessorEditor
{
public:
    explicit MidiTestAudioProcessorEditor(MidiTestAudioProcessor&);
    ~MidiTestAudioProcessorEditor() override = default;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    MidiTestAudioProcessor& processor;
    juce::Label title;
    juce::Label subtitle;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiTestAudioProcessorEditor)
};

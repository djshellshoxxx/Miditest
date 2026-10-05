#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"
#include "ui/MainView.h"

class MidiTestAudioProcessorEditor final : public juce::AudioProcessorEditor
{
public:
    explicit MidiTestAudioProcessorEditor(MidiTestAudioProcessor&);
    ~MidiTestAudioProcessorEditor() override = default;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    MidiTestAudioProcessor& processor;
    miditest::MainView mainView;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiTestAudioProcessorEditor)
};

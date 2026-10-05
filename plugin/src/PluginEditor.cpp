#include "PluginEditor.h"

MidiTestAudioProcessorEditor::MidiTestAudioProcessorEditor(MidiTestAudioProcessor& p)
    : juce::AudioProcessorEditor(&p), processor(p), mainView(p)
{
    setResizable(true, true);
    setResizeLimits(720, 480, 1800, 1200);
    setSize(1000, 700);
    addAndMakeVisible(mainView);
}

void MidiTestAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff080d14));
}

void MidiTestAudioProcessorEditor::resized()
{
    mainView.setBounds(getLocalBounds());
}

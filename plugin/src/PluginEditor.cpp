#include "PluginEditor.h"

MidiTestAudioProcessorEditor::MidiTestAudioProcessorEditor(MidiTestAudioProcessor& p)
    : juce::AudioProcessorEditor(&p), processor(p)
{
    setResizable(true, true);
    setResizeLimits(720, 480, 1800, 1200);
    setSize(1000, 700);

    title.setText("MIDItest", juce::dontSendNotification);
    title.setFont(juce::Font(28.0f, juce::Font::bold));
    title.setColour(juce::Label::textColourId, juce::Colours::whitesmoke);
    addAndMakeVisible(title);

    subtitle.setText("Circuit Drift Labs · Native VST3 / CLAP diagnostic port", juce::dontSendNotification);
    subtitle.setColour(juce::Label::textColourId, juce::Colour(0xff9aa7b5));
    addAndMakeVisible(subtitle);
}

void MidiTestAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff080d14));
    auto panel = getLocalBounds().reduced(18).toFloat();
    g.setColour(juce::Colour(0xff111b27));
    g.fillRoundedRectangle(panel, 8.0f);
    g.setColour(juce::Colour(0xff26384d));
    g.drawRoundedRectangle(panel, 8.0f, 1.0f);
}

void MidiTestAudioProcessorEditor::resized()
{
    auto area = getLocalBounds().reduced(32);
    title.setBounds(area.removeFromTop(42));
    subtitle.setBounds(area.removeFromTop(28));
}

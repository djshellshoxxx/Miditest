#include "MainView.h"

namespace miditest
{
MainView::MainView(MidiTestAudioProcessor& p)
    : processor(p),
      engine(p),
      mappingView(p.getMappingModel()),
      reportView(p)
{
    addAndMakeVisible(brand);
    addAndMakeVisible(status);
    addAndMakeVisible(resetButton);
    addAndMakeVisible(tabs);

    brand.setText("MIDItest  ·  Circuit Drift Labs", juce::dontSendNotification);
    brand.setFont(juce::Font(juce::FontOptions(22.0f).withStyle("Bold")));
    brand.setColour(juce::Label::textColourId, juce::Colours::whitesmoke);

    status.setColour(juce::Label::textColourId, juce::Colour(0xff9aa7b5));
    status.setJustificationType(juce::Justification::centredRight);

    const auto tabColour = juce::Colour(0xff111b27);
    tabs.addTab("Monitor", tabColour, &monitorView, false);
    tabs.addTab("Controls", tabColour, &controlsView, false);
    tabs.addTab("Keyboard", tabColour, &keyboardView, false);
    tabs.addTab("Timing", tabColour, &timingView, false);
    tabs.addTab("Mapping", tabColour, &mappingView, false);
    tabs.addTab("Report", tabColour, &reportView, false);

    monitorView.setClearCallback([this] {
        engine.getSession().clearDisplayHistory();
        refreshViews();
    });

    resetButton.onClick = [this] {
        engine.getSession().resetSession();
        refreshViews();
    };

    startTimerHz(30);
    refreshViews();
}

MainView::~MainView()
{
    stopTimer();
}

void MainView::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff080d14));
    auto panel = getLocalBounds().reduced(10).toFloat();
    g.setColour(juce::Colour(0xff111b27));
    g.fillRoundedRectangle(panel, 8.0f);
    g.setColour(juce::Colour(0xff26384d));
    g.drawRoundedRectangle(panel, 8.0f, 1.0f);
}

void MainView::resized()
{
    auto area = getLocalBounds().reduced(20);
    auto header = area.removeFromTop(42);
    brand.setBounds(header.removeFromLeft(330));
    resetButton.setBounds(header.removeFromRight(120).reduced(2));
    status.setBounds(header);
    area.removeFromTop(8);
    tabs.setBounds(area);
}

void MainView::timerCallback()
{
    engine.drain();
    refreshViews();
}

void MainView::refreshViews()
{
    const auto snapshot = engine.getSnapshot();

    monitorView.setSnapshot(snapshot);
    controlsView.setSnapshot(snapshot);
    keyboardView.setSnapshot(snapshot);
    timingView.setSnapshot(snapshot);
    mappingView.refresh();
    reportView.setSnapshot(snapshot);

    status.setText(
        "Events " + juce::String(snapshot.totalEventCount)
        + "  ·  " + juce::String(snapshot.messageRate, 1) + " msg/s"
        + "  ·  dropped " + juce::String(processor.getDroppedAnalysisEventCount()),
        juce::dontSendNotification);
}
}

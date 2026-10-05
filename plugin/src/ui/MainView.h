#pragma once

#include <JuceHeader.h>
#include "../PluginProcessor.h"
#include "../core/DiagnosticEngine.h"
#include "ControlsView.h"
#include "KeyboardView.h"
#include "MappingView.h"
#include "MonitorView.h"
#include "ReportView.h"
#include "TimingView.h"

namespace miditest
{
class MainView final : public juce::Component, private juce::Timer
{
public:
    explicit MainView(MidiTestAudioProcessor& processor);
    ~MainView() override;
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void refreshViews();

    MidiTestAudioProcessor& processor;
    DiagnosticEngine engine;
    juce::Label brand;
    juce::Label status;
    juce::TextButton resetButton { "Reset session" };
    juce::TabbedComponent tabs { juce::TabbedButtonBar::TabsAtTop };
    MonitorView monitorView;
    ControlsView controlsView;
    KeyboardView keyboardView;
    TimingView timingView;
    MappingView mappingView;
    ReportView reportView;
};
}

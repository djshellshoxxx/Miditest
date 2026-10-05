#include "TimingView.h"

namespace miditest
{
TimingView::TimingView()
{
    addAndMakeVisible(messageRate);
    addAndMakeVisible(clock);
    addAndMakeVisible(transport);
    for (auto* label : { &messageRate, &clock, &transport })
        label->setFont(juce::Font(juce::FontOptions(20.0f)));
}

void TimingView::setSnapshot(const SessionSnapshot& s)
{
    messageRate.setText("Messages/sec: " + juce::String(s.messageRate, 1)
                        + "    Peak: " + juce::String(s.peakMessageRate, 1), juce::dontSendNotification);
    clock.setText(s.clockBpm ? "MIDI Clock: " + juce::String(*s.clockBpm, 2) + " BPM" : "MIDI Clock: no stable clock measured", juce::dontSendNotification);
    transport.setText("Transport observed: Start " + juce::String(s.sawStart ? "yes" : "no")
                      + "  Continue " + juce::String(s.sawContinue ? "yes" : "no")
                      + "  Stop " + juce::String(s.sawStop ? "yes" : "no"), juce::dontSendNotification);
}

void TimingView::resized()
{
    auto area = getLocalBounds().reduced(12);
    messageRate.setBounds(area.removeFromTop(50));
    clock.setBounds(area.removeFromTop(50));
    transport.setBounds(area.removeFromTop(50));
}
}

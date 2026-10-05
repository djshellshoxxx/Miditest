#include "ControlsView.h"

namespace miditest
{
ControlsView::ControlsView()
{
    addAndMakeVisible(summary);
    summary.setMultiLine(true);
    summary.setReadOnly(true);
    summary.setFont(juce::Font(juce::FontOptions(14.0f).withName(juce::Font::getDefaultMonospacedFontName())));
}

void ControlsView::setSnapshot(const SessionSnapshot& snapshot)
{
    juce::String text;
    text << "Detected controls: " << snapshot.controls.size() << "\n\n";
    for (const auto& c : snapshot.controls)
    {
        text << "CC" << c.controller << "  ch " << c.channel
             << "  now " << c.currentValue
             << "  min/max " << c.stats.min << '/' << c.stats.max
             << "  range " << c.stats.range
             << "  unique " << c.stats.unique
             << "  jitter " << juce::String(c.stats.jitter, 2)
             << "  jumps " << c.stats.jumps
             << "  reversals " << c.stats.reversals
             << "  " << c.encoderClass << "\n";
        if (!c.recentValues.empty())
        {
            text << "  recent: ";
            const auto start = c.recentValues.size() > 32 ? c.recentValues.size() - 32 : 0;
            for (std::size_t i = start; i < c.recentValues.size(); ++i)
                text << c.recentValues[i] << (i + 1 < c.recentValues.size() ? "," : "");
            text << "\n";
        }
    }
    summary.setText(text, false);
}

void ControlsView::resized()
{
    summary.setBounds(getLocalBounds().reduced(8));
}
}

#include "KeyboardView.h"
#include "../core/MidiMessageDecoder.h"

namespace miditest
{
KeyboardView::KeyboardView()
{
    addAndMakeVisible(status);
    addAndMakeVisible(notes);
    status.setFont(juce::Font(juce::FontOptions(18.0f).withStyle("Bold")));
    notes.setMultiLine(true);
    notes.setReadOnly(true);
}

void KeyboardView::setSnapshot(const SessionSnapshot& snapshot)
{
    status.setText("Note On: " + juce::String(snapshot.noteOnCount)
                   + "    Note Off: " + juce::String(snapshot.noteOffCount)
                   + "    Held: " + juce::String(snapshot.heldNotes.size()), juce::dontSendNotification);
    juce::String text("Currently held notes\n\n");
    for (const int note : snapshot.heldNotes)
        text << noteName(note) << " (" << note << ")\n";
    if (snapshot.heldNotes.empty())
        text << "None\n";
    notes.setText(text, false);
}

void KeyboardView::resized()
{
    auto area = getLocalBounds().reduced(8);
    status.setBounds(area.removeFromTop(40));
    notes.setBounds(area);
}
}

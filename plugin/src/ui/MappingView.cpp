#include "MappingView.h"
#include "../core/MidiMessageDecoder.h"

namespace miditest
{
MappingView::MappingView(MappingModel& mappingModel) : model(mappingModel)
{
    for (auto* c : { static_cast<juce::Component*>(&learnButton), static_cast<juce::Component*>(&learnedLabel), static_cast<juce::Component*>(&hardwareLabel), static_cast<juce::Component*>(&assignment), static_cast<juce::Component*>(&saveButton), static_cast<juce::Component*>(&mappingList) })
        addAndMakeVisible(c);

    hardwareLabel.setTextToShowWhenEmpty("Hardware label, e.g. Knob 1", juce::Colour(0xff73808f));
    assignment.setTextToShowWhenEmpty("Assignment, e.g. Filter Cutoff", juce::Colour(0xff73808f));
    mappingList.setMultiLine(true);
    mappingList.setReadOnly(true);
    learnButton.onClick = [this] {
        current.reset();
        learnedLabel.setText("Move or press a MIDI control…", juce::dontSendNotification);
        model.beginLearn();
    };
    saveButton.onClick = [this] { saveCurrent(); };
    refresh();
}

void MappingView::refresh()
{
    if (auto learned = model.consumeLearnResult())
    {
        current = learned;
        learnedLabel.setText(messageTypeName(learned->type) + "  ch " + juce::String(learned->channel)
                             + "  id " + juce::String(learned->identifier)
                             + "  value " + juce::String(learned->value), juce::dontSendNotification);
    }

    juce::String text;
    for (const auto& entry : model.snapshot().entries)
        text << messageTypeName(entry.key.type) << "  ch " << entry.key.channel << "  id " << entry.key.identifier
             << "  " << entry.hardwareLabel << "  →  " << entry.assignment << "\n";
    if (text.isEmpty()) text = "No saved mappings yet.";
    mappingList.setText(text, false);
}

void MappingView::saveCurrent()
{
    if (!current) return;
    MappingEntry entry;
    entry.key = { current->type, current->channel, current->identifier };
    entry.hardwareLabel = hardwareLabel.getText().trim();
    entry.assignment = assignment.getText().trim();
    model.upsert(entry);
    refresh();
}

void MappingView::resized()
{
    auto area = getLocalBounds().reduced(8);
    auto row = area.removeFromTop(36);
    learnButton.setBounds(row.removeFromLeft(120).reduced(2));
    learnedLabel.setBounds(row);
    row = area.removeFromTop(36);
    hardwareLabel.setBounds(row.removeFromLeft(row.getWidth() / 2).reduced(2));
    assignment.setBounds(row.reduced(2));
    saveButton.setBounds(area.removeFromTop(36).removeFromLeft(140).reduced(2));
    mappingList.setBounds(area.reduced(0, 8));
}
}

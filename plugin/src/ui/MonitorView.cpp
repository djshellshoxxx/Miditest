#include "MonitorView.h"
#include "../core/MidiMessageDecoder.h"

namespace miditest
{
MonitorView::MonitorView()
{
    for (auto* c : { static_cast<juce::Component*>(&pauseButton), static_cast<juce::Component*>(&clearButton), static_cast<juce::Component*>(&autoscrollButton), static_cast<juce::Component*>(&typeFilter), static_cast<juce::Component*>(&channelFilter), static_cast<juce::Component*>(&searchBox), static_cast<juce::Component*>(&eventText) })
        addAndMakeVisible(c);

    autoscrollButton.setToggleState(true, juce::dontSendNotification);
    typeFilter.addItem("All types", 1);
    typeFilter.addItem("Notes", 2);
    typeFilter.addItem("CC", 3);
    typeFilter.addItem("Pitch", 4);
    typeFilter.addItem("Clock/transport", 5);
    typeFilter.setSelectedId(1);

    channelFilter.addItem("All channels", 1);
    for (int ch = 1; ch <= 16; ++ch)
        channelFilter.addItem("Channel " + juce::String(ch), ch + 1);
    channelFilter.setSelectedId(1);

    searchBox.setTextToShowWhenEmpty("Search events", juce::Colour(0xff73808f));
    eventText.setMultiLine(true);
    eventText.setReadOnly(true);
    eventText.setScrollbarsShown(true);
    eventText.setFont(juce::Font(juce::FontOptions(13.0f).withName(juce::Font::getDefaultMonospacedFontName())));

    clearButton.onClick = [this] { if (onClear) onClear(); };
    pauseButton.onClick = [this] { if (!pauseButton.getToggleState()) rebuildText(); };
    typeFilter.onChange = [this] { rebuildText(); };
    channelFilter.onChange = [this] { rebuildText(); };
    searchBox.onTextChange = [this] { rebuildText(); };
}

bool MonitorView::eventMatches(const DecodedMidiEvent& event) const
{
    const int channelChoice = channelFilter.getSelectedId() - 1;
    if (channelChoice > 0 && event.channel != channelChoice)
        return false;

    switch (typeFilter.getSelectedId())
    {
        case 2:
            if (event.type != MidiMessageType::noteOn && event.type != MidiMessageType::noteOff && event.type != MidiMessageType::polyAftertouch) return false;
            break;
        case 3: if (event.type != MidiMessageType::controlChange) return false; break;
        case 4: if (event.type != MidiMessageType::pitchBend) return false; break;
        case 5:
            if (event.type != MidiMessageType::clock && event.type != MidiMessageType::start && event.type != MidiMessageType::continueMessage && event.type != MidiMessageType::stop) return false;
            break;
        default: break;
    }
    return true;
}

void MonitorView::setSnapshot(const SessionSnapshot& s)
{
    snapshot = s;
    if (!pauseButton.getToggleState())
        rebuildText();
}

void MonitorView::rebuildText()
{
    juce::String output;
    const auto search = searchBox.getText().trim().toLowerCase();
    for (const auto& event : snapshot.history)
    {
        if (!eventMatches(event)) continue;
        juce::String raw;
        for (int i = 0; i < event.rawSize; ++i)
            raw << juce::String::toHexString(static_cast<int>(event.raw[static_cast<std::size_t>(i)])).paddedLeft('0', 2).toUpperCase() << (i + 1 < event.rawSize ? " " : "");

        juce::String line;
        line << juce::String(event.sessionSeconds, 3).paddedLeft(' ', 8) << "  ";
        line << (event.channel > 0 ? "ch " + juce::String(event.channel).paddedLeft('0', 2) : "ch --") << "  ";
        line << messageTypeName(event.type).paddedRight(' ', 18) << " id=" << event.identifier << " value=" << event.value << "  [" << raw << "]";
        if (search.isNotEmpty() && !line.toLowerCase().contains(search)) continue;
        output << line << "\n";
    }
    eventText.setText(output, false);
    if (autoscrollButton.getToggleState())
        eventText.moveCaretToEnd();
}

void MonitorView::resized()
{
    auto area = getLocalBounds().reduced(8);
    auto toolbar = area.removeFromTop(32);
    pauseButton.setBounds(toolbar.removeFromLeft(120));
    clearButton.setBounds(toolbar.removeFromLeft(100).reduced(2));
    autoscrollButton.setBounds(toolbar.removeFromLeft(110));
    typeFilter.setBounds(toolbar.removeFromLeft(150).reduced(2));
    channelFilter.setBounds(toolbar.removeFromLeft(150).reduced(2));
    searchBox.setBounds(toolbar.reduced(2));
    eventText.setBounds(area.reduced(0, 6));
}
}

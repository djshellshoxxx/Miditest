#pragma once

#include <JuceHeader.h>
#include "MidiEvent.h"

namespace miditest
{
juce::String noteName(int midiNote);
DecodedMidiEvent decodeMidiMessage(const juce::MidiMessage& message, int sampleOffset, double sessionSeconds) noexcept;
juce::String messageTypeName(MidiMessageType type);
}

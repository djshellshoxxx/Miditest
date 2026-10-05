#include "MidiMessageDecoder.h"
#include <algorithm>

namespace miditest
{
juce::String noteName(int midiNote)
{
    static constexpr const char* names[] = {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};
    const auto note = juce::jlimit(0, 127, midiNote);
    return juce::String(names[note % 12]) + juce::String(note / 12 - 1);
}

DecodedMidiEvent decodeMidiMessage(const juce::MidiMessage& message, int sampleOffset, double sessionSeconds) noexcept
{
    DecodedMidiEvent e;
    e.sessionSeconds = sessionSeconds;
    e.sampleOffset = sampleOffset;
    const auto* bytes = message.getRawData();
    const int size = juce::jmin(3, message.getRawDataSize());
    e.rawSize = static_cast<std::uint8_t>(size);
    for (int i = 0; i < size; ++i)
        e.raw[static_cast<std::size_t>(i)] = bytes[i];

    if (size == 0)
        return e;

    e.status = bytes[0];
    e.data1 = size > 1 ? bytes[1] : 0;
    e.data2 = size > 2 ? bytes[2] : 0;
    const auto hi = static_cast<std::uint8_t>(e.status & 0xf0);
    e.channel = (hi >= 0x80 && hi <= 0xe0) ? ((e.status & 0x0f) + 1) : 0;

    if (hi == 0x80 || (hi == 0x90 && e.data2 == 0))
    {
        e.type = MidiMessageType::noteOff; e.identifier = e.data1; e.value = e.data2;
    }
    else if (hi == 0x90)
    {
        e.type = MidiMessageType::noteOn; e.identifier = e.data1; e.value = e.data2;
    }
    else if (hi == 0xa0)
    {
        e.type = MidiMessageType::polyAftertouch; e.identifier = e.data1; e.value = e.data2;
    }
    else if (hi == 0xb0)
    {
        e.type = MidiMessageType::controlChange; e.identifier = e.data1; e.value = e.data2;
    }
    else if (hi == 0xc0)
    {
        e.type = MidiMessageType::programChange; e.identifier = e.data1; e.value = e.data1;
    }
    else if (hi == 0xd0)
    {
        e.type = MidiMessageType::channelAftertouch; e.value = e.data1;
    }
    else if (hi == 0xe0)
    {
        e.type = MidiMessageType::pitchBend; e.value = ((e.data2 << 7) | e.data1) - 8192;
    }
    else
    {
        switch (e.status)
        {
            case 0xf8: e.type = MidiMessageType::clock; break;
            case 0xfa: e.type = MidiMessageType::start; break;
            case 0xfb: e.type = MidiMessageType::continueMessage; break;
            case 0xfc: e.type = MidiMessageType::stop; break;
            case 0xfe: e.type = MidiMessageType::activeSense; break;
            case 0xff: e.type = MidiMessageType::systemReset; break;
            default: e.type = MidiMessageType::system; break;
        }
        e.value = size > 2 ? e.data2 : e.data1;
    }
    return e;
}

juce::String messageTypeName(MidiMessageType type)
{
    switch (type)
    {
        case MidiMessageType::noteOn: return "Note On";
        case MidiMessageType::noteOff: return "Note Off";
        case MidiMessageType::polyAftertouch: return "Poly Aftertouch";
        case MidiMessageType::controlChange: return "Control Change";
        case MidiMessageType::programChange: return "Program Change";
        case MidiMessageType::channelAftertouch: return "Channel Aftertouch";
        case MidiMessageType::pitchBend: return "Pitch Bend";
        case MidiMessageType::clock: return "MIDI Clock";
        case MidiMessageType::start: return "Start";
        case MidiMessageType::continueMessage: return "Continue";
        case MidiMessageType::stop: return "Stop";
        case MidiMessageType::activeSense: return "Active Sense";
        case MidiMessageType::systemReset: return "System Reset";
        default: return "System";
    }
}
}

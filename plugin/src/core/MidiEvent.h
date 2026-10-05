#pragma once

#include <array>
#include <cstdint>

namespace miditest
{
enum class MidiMessageType : std::uint8_t
{
    noteOn,
    noteOff,
    polyAftertouch,
    controlChange,
    programChange,
    channelAftertouch,
    pitchBend,
    clock,
    start,
    continueMessage,
    stop,
    activeSense,
    systemReset,
    system
};

struct DecodedMidiEvent
{
    double sessionSeconds = 0.0;
    int sampleOffset = 0;
    std::uint8_t status = 0;
    int channel = 0;
    MidiMessageType type = MidiMessageType::system;
    int data1 = 0;
    int data2 = 0;
    int value = 0;
    int identifier = -1;
    std::array<std::uint8_t, 3> raw {};
    std::uint8_t rawSize = 0;
};
}

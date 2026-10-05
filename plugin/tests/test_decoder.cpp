#include <JuceHeader.h>
#include "core/MidiMessageDecoder.h"
#include <iostream>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __FILE__ << ':' << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

int main()
{
    using namespace miditest;
    CHECK(noteName(60) == "C4");
    CHECK(noteName(69) == "A4");

    auto on = decodeMidiMessage(juce::MidiMessage::noteOn(2, 60, (juce::uint8)100), 12, 1.5);
    CHECK(on.type == MidiMessageType::noteOn);
    CHECK(on.channel == 2 && on.identifier == 60 && on.value == 100 && on.sampleOffset == 12);

    const juce::uint8 zeroOnBytes[] { 0x90, 60, 0 };
    auto zeroOn = decodeMidiMessage(juce::MidiMessage(zeroOnBytes, 3), 0, 0.0);
    CHECK(zeroOn.type == MidiMessageType::noteOff);
    CHECK(zeroOn.status == 0x90);

    auto cc = decodeMidiMessage(juce::MidiMessage::controllerEvent(3, 74, 127), 0, 0.0);
    CHECK(cc.type == MidiMessageType::controlChange && cc.channel == 3 && cc.identifier == 74 && cc.value == 127);

    const juce::uint8 pcBytes[] { 0xC4, 12 };
    auto pc = decodeMidiMessage(juce::MidiMessage(pcBytes, 2), 0, 0.0);
    CHECK(pc.type == MidiMessageType::programChange && pc.channel == 5 && pc.value == 12);

    const juce::uint8 chPressureBytes[] { 0xD0, 88 };
    CHECK(decodeMidiMessage(juce::MidiMessage(chPressureBytes, 2), 0, 0.0).type == MidiMessageType::channelAftertouch);

    const juce::uint8 polyBytes[] { 0xA0, 64, 77 };
    auto poly = decodeMidiMessage(juce::MidiMessage(polyBytes, 3), 0, 0.0);
    CHECK(poly.type == MidiMessageType::polyAftertouch && poly.identifier == 64 && poly.value == 77);

    const juce::uint8 bendMinBytes[] { 0xE0, 0, 0 };
    const juce::uint8 bendCtrBytes[] { 0xE0, 0, 64 };
    const juce::uint8 bendMaxBytes[] { 0xE0, 127, 127 };
    CHECK(decodeMidiMessage(juce::MidiMessage(bendMinBytes, 3), 0, 0.0).value == -8192);
    CHECK(decodeMidiMessage(juce::MidiMessage(bendCtrBytes, 3), 0, 0.0).value == 0);
    CHECK(decodeMidiMessage(juce::MidiMessage(bendMaxBytes, 3), 0, 0.0).value == 8191);

    const struct { juce::uint8 status; MidiMessageType type; } systemCases[] = {
        { 0xF8, MidiMessageType::clock }, { 0xFA, MidiMessageType::start },
        { 0xFB, MidiMessageType::continueMessage }, { 0xFC, MidiMessageType::stop },
        { 0xFE, MidiMessageType::activeSense }, { 0xFF, MidiMessageType::systemReset }
    };
    for (const auto& c : systemCases)
    {
        const juce::uint8 b[] { c.status };
        CHECK(decodeMidiMessage(juce::MidiMessage(b, 1), 0, 0.0).type == c.type);
    }

    const juce::uint8 genericBytes[] { 0xF1, 2 };
    CHECK(decodeMidiMessage(juce::MidiMessage(genericBytes, 2), 0, 0.0).type == MidiMessageType::system);
    return failures == 0 ? 0 : 1;
}

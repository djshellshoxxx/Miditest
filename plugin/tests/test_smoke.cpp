#include <JuceHeader.h>
#include "PluginProcessor.h"
#include <iostream>

static int fail(const char* message)
{
    std::cerr << message << std::endl;
    return 1;
}

int main()
{
    MidiTestAudioProcessor processor;
    if (processor.getName() != "MIDItest")
        return fail("unexpected plugin name");
    if (! processor.acceptsMidi() || ! processor.producesMidi())
        return fail("MIDI input/output flags must be enabled");
    if (processor.getLatencySamples() != 0)
        return fail("MIDItest must report zero latency");
    return 0;
}

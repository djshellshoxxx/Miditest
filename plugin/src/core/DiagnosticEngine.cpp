#include "DiagnosticEngine.h"
#include "../PluginProcessor.h"

namespace miditest
{
DiagnosticEngine::DiagnosticEngine(MidiTestAudioProcessor& processorToDrain, std::size_t historyCapacity)
    : processor(processorToDrain), session(historyCapacity)
{
}

std::size_t DiagnosticEngine::drain()
{
    std::size_t count = 0;
    DecodedMidiEvent event;
    while (processor.tryPopEvent(event))
    {
        session.ingest(event);
        processor.getMappingModel().observe(event);
        ++count;
    }
    return count;
}
}

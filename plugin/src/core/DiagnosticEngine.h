#pragma once

#include "SessionModel.h"

class MidiTestAudioProcessor;

namespace miditest
{
class DiagnosticEngine
{
public:
    explicit DiagnosticEngine(MidiTestAudioProcessor& processorToDrain, std::size_t historyCapacity = 5000);

    std::size_t drain();
    SessionSnapshot getSnapshot() const { return session.getSnapshot(); }
    SessionModel& getSession() noexcept { return session; }
    const SessionModel& getSession() const noexcept { return session; }

private:
    MidiTestAudioProcessor& processor;
    SessionModel session;
};
}

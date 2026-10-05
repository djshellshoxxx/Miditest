#include "core/SessionModel.h"
#include <iostream>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

static miditest::DecodedMidiEvent makeEvent(miditest::MidiMessageType type, int id, int value, double t, int channel = 1)
{
    miditest::DecodedMidiEvent e;
    e.type = type;
    e.identifier = id;
    e.value = value;
    e.sessionSeconds = t;
    e.channel = channel;
    return e;
}

int main()
{
    using namespace miditest;
    SessionModel session(5000);

    for (int i = 0; i < 5001; ++i)
        session.ingest(makeEvent(MidiMessageType::controlChange, 74, i & 127, i * 0.001));

    auto snap = session.getSnapshot();
    CHECK(snap.totalEventCount == 5001);
    CHECK(snap.history.size() == 5000);
    CHECK(snap.history.front().sessionSeconds > 0.0);
    CHECK(snap.channels.count(1) == 1);
    CHECK(snap.controls.size() == 1);

    session.ingest(makeEvent(MidiMessageType::noteOn, 60, 100, 6.0));
    snap = session.getSnapshot();
    CHECK(snap.heldNotes.count(60) == 1);
    CHECK(snap.noteOnCount == 1);

    session.ingest(makeEvent(MidiMessageType::noteOff, 60, 0, 6.1));
    snap = session.getSnapshot();
    CHECK(snap.heldNotes.empty());
    CHECK(snap.noteOffCount == 1);

    const auto beforeClear = snap.totalEventCount;
    session.clearDisplayHistory();
    snap = session.getSnapshot();
    CHECK(snap.history.empty());
    CHECK(snap.totalEventCount == beforeClear);
    CHECK(!snap.controls.empty());

    session.resetSession();
    snap = session.getSnapshot();
    CHECK(snap.totalEventCount == 0);
    CHECK(snap.history.empty());
    CHECK(snap.controls.empty());
    CHECK(snap.channels.empty());
    return failures == 0 ? 0 : 1;
}

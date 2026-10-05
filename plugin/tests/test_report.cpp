#include <JuceHeader.h>
#include "core/ReportBuilder.h"
#include <iostream>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

int main()
{
    using namespace miditest;
    SessionSnapshot session;
    session.totalEventCount = 42;
    session.sessionDurationSeconds = 12.5;
    session.channels.insert(1);
    session.channels.insert(2);
    session.heldNotes.insert(60);
    session.noteOnCount = 4;
    session.noteOffCount = 3;
    session.clockBpm = 128.0;
    session.pitch = { 3, -8192, 8191, 0, 12 };
    ControlSnapshot control;
    control.channel = 1;
    control.controller = 74;
    control.currentValue = 100;
    control.stats.count = 20;
    control.stats.min = 10;
    control.stats.max = 100;
    control.stats.range = 90;
    control.stats.jitter = 3.5;
    control.stats.jumps = 2;
    control.encoderClass = "Unknown / mixed";
    session.controls.push_back(control);

    MappingSnapshot mapping;
    mapping.entries.push_back({ { MidiMessageType::controlChange, 1, 74 }, "Knob 1", "Filter Cutoff" });

    ReportMetadata metadata;
    metadata.version = "0.1.0-alpha.1";
    metadata.pluginFormat = "VST3";
    metadata.droppedAnalysisEventCount = 5;

    const auto report = buildReport(session, mapping, metadata);
    auto* object = report.getDynamicObject();
    CHECK(object != nullptr);
    CHECK(object->getProperty("version").toString() == "0.1.0-alpha.1");
    CHECK(static_cast<int>(object->getProperty("eventCount")) == 42);
    CHECK(static_cast<int>(object->getProperty("droppedAnalysisEvents")) == 5);

    const auto json = juce::JSON::toString(report, true);
    CHECK(json.contains("Filter Cutoff"));
    CHECK(json.contains("limited range observed"));
    CHECK(json.contains("high jitter observed"));
    CHECK(json.contains("sudden jumps observed"));
    CHECK(!json.containsIgnoreCase("defective"));
    CHECK(!json.containsIgnoreCase("failed hardware"));
    return failures == 0 ? 0 : 1;
}

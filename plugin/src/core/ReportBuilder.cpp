#include "ReportBuilder.h"
#include "MidiMessageDecoder.h"

namespace miditest
{
static juce::var makeArray(const std::set<int>& values)
{
    juce::Array<juce::var> array;
    for (const int value : values) array.add(value);
    return juce::var(array);
}

juce::var buildReport(const SessionSnapshot& session, const MappingSnapshot& mappings, const ReportMetadata& metadata)
{
    auto root = std::make_unique<juce::DynamicObject>();
    root->setProperty("product", "MIDItest");
    root->setProperty("vendor", "Circuit Drift Labs");
    root->setProperty("version", metadata.version);
    root->setProperty("pluginFormat", metadata.pluginFormat);
    root->setProperty("sessionDurationSeconds", session.sessionDurationSeconds);
    root->setProperty("eventCount", static_cast<juce::int64>(session.totalEventCount));
    root->setProperty("droppedAnalysisEvents", static_cast<juce::int64>(metadata.droppedAnalysisEventCount));
    root->setProperty("channels", makeArray(session.channels));
    root->setProperty("heldOrStuckNoteCandidates", makeArray(session.heldNotes));
    root->setProperty("noteOnCount", static_cast<juce::int64>(session.noteOnCount));
    root->setProperty("noteOffCount", static_cast<juce::int64>(session.noteOffCount));
    root->setProperty("messageRate", session.messageRate);
    root->setProperty("peakMessageRate", session.peakMessageRate);

    juce::Array<juce::var> messageCounts;
    for (std::size_t i = 0; i < session.typeCounts.size(); ++i)
    {
        if (session.typeCounts[i] == 0) continue;
        auto item = std::make_unique<juce::DynamicObject>();
        item->setProperty("type", messageTypeName(static_cast<MidiMessageType>(i)));
        item->setProperty("count", static_cast<juce::int64>(session.typeCounts[i]));
        messageCounts.add(juce::var(item.release()));
    }
    root->setProperty("messageCounts", juce::var(messageCounts));

    juce::Array<juce::var> controls;
    juce::Array<juce::var> findings;
    for (const auto& control : session.controls)
    {
        auto item = std::make_unique<juce::DynamicObject>();
        item->setProperty("channel", control.channel);
        item->setProperty("cc", control.controller);
        item->setProperty("current", control.currentValue);
        item->setProperty("count", static_cast<juce::int64>(control.stats.count));
        item->setProperty("min", control.stats.min);
        item->setProperty("max", control.stats.max);
        item->setProperty("range", control.stats.range);
        item->setProperty("uniqueValues", static_cast<juce::int64>(control.stats.unique));
        item->setProperty("jitter", control.stats.jitter);
        item->setProperty("jumps", control.stats.jumps);
        item->setProperty("reversals", control.stats.reversals);
        item->setProperty("encoderClassification", control.encoderClass);
        controls.add(juce::var(item.release()));

        const auto prefix = "CC" + juce::String(control.controller) + " ch " + juce::String(control.channel) + ": ";
        if (control.stats.range < 120 && control.stats.count >= 4)
            findings.add(prefix + "limited range observed");
        if (control.stats.jitter >= 2.0)
            findings.add(prefix + "high jitter observed");
        if (control.stats.jumps > 0)
            findings.add(prefix + "sudden jumps observed");
    }
    root->setProperty("controls", juce::var(controls));

    auto pitch = std::make_unique<juce::DynamicObject>();
    pitch->setProperty("count", static_cast<juce::int64>(session.pitch.count));
    pitch->setProperty("min", session.pitch.min);
    pitch->setProperty("max", session.pitch.max);
    if (session.pitch.center) pitch->setProperty("center", *session.pitch.center);
    if (session.pitch.centerSpread) pitch->setProperty("centerSpread", *session.pitch.centerSpread);
    root->setProperty("pitchBend", juce::var(pitch.release()));

    auto clock = std::make_unique<juce::DynamicObject>();
    if (session.clockBpm) clock->setProperty("bpm", *session.clockBpm);
    clock->setProperty("startObserved", session.sawStart);
    clock->setProperty("continueObserved", session.sawContinue);
    clock->setProperty("stopObserved", session.sawStop);
    root->setProperty("clock", juce::var(clock.release()));

    if (!session.heldNotes.empty())
        findings.add("held/stuck-note candidates observed at report time");
    if (session.pitch.centerSpread && *session.pitch.centerSpread > 20)
        findings.add("pitch-bend return-to-center spread observed");

    juce::Array<juce::var> mappingArray;
    for (const auto& mapping : mappings.entries)
    {
        auto item = std::make_unique<juce::DynamicObject>();
        item->setProperty("type", messageTypeName(mapping.key.type));
        item->setProperty("channel", mapping.key.channel);
        item->setProperty("identifier", mapping.key.identifier);
        item->setProperty("hardwareLabel", mapping.hardwareLabel);
        item->setProperty("assignment", mapping.assignment);
        mappingArray.add(juce::var(item.release()));
    }
    root->setProperty("mappings", juce::var(mappingArray));
    root->setProperty("findings", juce::var(findings));
    return juce::var(root.release());
}
}

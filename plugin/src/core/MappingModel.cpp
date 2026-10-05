#include "MappingModel.h"

namespace miditest
{
void MappingModel::beginLearn(bool includeSystemTraffic) noexcept
{
    learning = true;
    learnSystemTraffic = includeSystemTraffic;
    pendingLearnResult.reset();
}

void MappingModel::cancelLearn() noexcept
{
    learning = false;
    pendingLearnResult.reset();
}

void MappingModel::observe(const DecodedMidiEvent& event)
{
    if (!learning || pendingLearnResult.has_value())
        return;

    const bool passiveSystem = event.type == MidiMessageType::clock
        || event.type == MidiMessageType::activeSense
        || event.type == MidiMessageType::start
        || event.type == MidiMessageType::continueMessage
        || event.type == MidiMessageType::stop
        || event.type == MidiMessageType::systemReset
        || event.type == MidiMessageType::system;

    if (passiveSystem && !learnSystemTraffic)
        return;

    pendingLearnResult = LearnResult { event.type, event.channel, event.identifier, event.value };
    learning = false;
}

std::optional<LearnResult> MappingModel::consumeLearnResult()
{
    auto result = pendingLearnResult;
    pendingLearnResult.reset();
    return result;
}

void MappingModel::upsert(const MappingEntry& entry)
{
    entries[entry.key] = entry;
}

bool MappingModel::erase(const MappingKey& key)
{
    return entries.erase(key) != 0;
}

void MappingModel::clear()
{
    entries.clear();
}

MappingSnapshot MappingModel::snapshot() const
{
    MappingSnapshot out;
    out.entries.reserve(entries.size());
    for (const auto& pair : entries)
        out.entries.push_back(pair.second);
    return out;
}

juce::ValueTree MappingModel::toValueTree() const
{
    juce::ValueTree root("MAPPINGS");
    for (const auto& [key, entry] : entries)
    {
        juce::ValueTree child("MAPPING");
        child.setProperty("type", static_cast<int>(key.type), nullptr);
        child.setProperty("channel", key.channel, nullptr);
        child.setProperty("identifier", key.identifier, nullptr);
        child.setProperty("hardwareLabel", entry.hardwareLabel, nullptr);
        child.setProperty("assignment", entry.assignment, nullptr);
        root.addChild(child, -1, nullptr);
    }
    return root;
}

void MappingModel::restoreFromValueTree(const juce::ValueTree& tree)
{
    if (!tree.isValid() || !tree.hasType("MAPPINGS"))
        return;

    std::map<MappingKey, MappingEntry> restored;
    for (int i = 0; i < tree.getNumChildren(); ++i)
    {
        const auto child = tree.getChild(i);
        if (!child.hasType("MAPPING"))
            continue;
        MappingEntry entry;
        entry.key.type = static_cast<MidiMessageType>(static_cast<int>(child.getProperty("type", static_cast<int>(MidiMessageType::system))));
        entry.key.channel = static_cast<int>(child.getProperty("channel", 0));
        entry.key.identifier = static_cast<int>(child.getProperty("identifier", -1));
        entry.hardwareLabel = child.getProperty("hardwareLabel", "").toString();
        entry.assignment = child.getProperty("assignment", "").toString();
        restored[entry.key] = entry;
    }
    entries = std::move(restored);
}
}

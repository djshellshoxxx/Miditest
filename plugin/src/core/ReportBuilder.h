#pragma once

#include <JuceHeader.h>
#include "MappingModel.h"
#include "SessionModel.h"
#include <cstdint>

namespace miditest
{
struct ReportMetadata
{
    juce::String version { "0.1.0-alpha.1" };
    juce::String pluginFormat { "unknown" };
    std::uint64_t droppedAnalysisEventCount = 0;
};

juce::var buildReport(const SessionSnapshot& session, const MappingSnapshot& mappings, const ReportMetadata& metadata);
}

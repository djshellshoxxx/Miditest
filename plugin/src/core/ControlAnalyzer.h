#pragma once

#include <JuceHeader.h>
#include <cstddef>
#include <span>

namespace miditest
{
struct ControlStats
{
    std::size_t count = 0;
    int min = 0;
    int max = 0;
    int range = 0;
    std::size_t unique = 0;
    double jitter = 0.0;
    int jumps = 0;
    int reversals = 0;
};

ControlStats analyzeControl(std::span<const int> values);
juce::String classifyEncoder(std::span<const int> values);
}

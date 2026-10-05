#include "ControlAnalyzer.h"

#include <algorithm>
#include <cmath>
#include <set>

namespace miditest
{
ControlStats analyzeControl(std::span<const int> values)
{
    ControlStats out;
    if (values.empty())
        return out;

    out.count = values.size();
    const auto [minIt, maxIt] = std::minmax_element(values.begin(), values.end());
    out.min = *minIt;
    out.max = *maxIt;
    out.range = out.max - out.min;
    out.unique = std::set<int>(values.begin(), values.end()).size();

    int lastDirection = 0;
    for (std::size_t i = 1; i < values.size(); ++i)
    {
        const int delta = values[i] - values[i - 1];
        if (std::abs(delta) > 12)
            ++out.jumps;
        const int direction = (delta > 0) - (delta < 0);
        if (direction != 0 && lastDirection != 0 && direction != lastDirection)
            ++out.reversals;
        if (direction != 0)
            lastDirection = direction;
    }

    const std::size_t tailCount = std::min<std::size_t>(20, values.size());
    const auto tail = values.subspan(values.size() - tailCount);
    double mean = 0.0;
    for (const int value : tail)
        mean += value;
    mean /= static_cast<double>(tail.size());

    double variance = 0.0;
    for (const int value : tail)
    {
        const double delta = static_cast<double>(value) - mean;
        variance += delta * delta;
    }
    variance /= static_cast<double>(tail.size());
    out.jitter = std::round(std::sqrt(variance) * 100.0) / 100.0;
    return out;
}

juce::String classifyEncoder(std::span<const int> values)
{
    if (values.size() < 4)
        return "Insufficient data";

    const auto [minIt, maxIt] = std::minmax_element(values.begin(), values.end());
    const std::set<int> unique(values.begin(), values.end());
    if (*minIt >= 0 && *maxIt <= 127 && unique.size() > 16)
        return "Absolute 0-127";

    std::size_t relativeHits = 0;
    for (const int value : values)
        if (value == 1 || value == 65 || value == 63 || value == 127)
            ++relativeHits;

    if (static_cast<double>(relativeHits) / static_cast<double>(values.size()) > 0.7)
        return "Likely relative encoder";
    return "Unknown / mixed";
}
}

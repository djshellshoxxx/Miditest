#include "PitchAnalyzer.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace miditest
{
PitchStats analyzePitch(std::span<const int> values)
{
    PitchStats out;
    if (values.empty())
        return out;

    out.count = values.size();
    const auto [minIt, maxIt] = std::minmax_element(values.begin(), values.end());
    out.min = *minIt;
    out.max = *maxIt;

    std::vector<int> nearCenter;
    nearCenter.reserve(values.size());
    for (const int value : values)
        if (std::abs(value) < 1024)
            nearCenter.push_back(value);

    if (nearCenter.empty())
        return out;

    double mean = 0.0;
    for (const int value : nearCenter)
        mean += value;
    mean /= static_cast<double>(nearCenter.size());

    double variance = 0.0;
    for (const int value : nearCenter)
    {
        const double delta = static_cast<double>(value) - mean;
        variance += delta * delta;
    }
    variance /= static_cast<double>(nearCenter.size());

    out.center = static_cast<int>(std::lround(mean));
    out.centerSpread = static_cast<int>(std::lround(std::sqrt(variance)));
    return out;
}
}

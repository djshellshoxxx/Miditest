#include "ClockAnalyzer.h"

#include <algorithm>
#include <vector>

namespace miditest
{
std::optional<double> calculateClockBpm(std::span<const double> timestampsSeconds)
{
    if (timestampsSeconds.size() < 25)
        return std::nullopt;

    std::vector<double> diffs;
    diffs.reserve(timestampsSeconds.size() - 1);
    for (std::size_t i = 1; i < timestampsSeconds.size(); ++i)
    {
        const double d = timestampsSeconds[i] - timestampsSeconds[i - 1];
        if (d > 0.0 && d < 0.5)
            diffs.push_back(d);
    }
    if (diffs.empty())
        return std::nullopt;

    std::sort(diffs.begin(), diffs.end());
    const double median = diffs[diffs.size() / 2];
    return 60.0 / (median * 24.0);
}

double calculateMessageRate(std::span<const double> timestampsSeconds, double windowSeconds)
{
    if (timestampsSeconds.empty() || windowSeconds <= 0.0)
        return 0.0;
    const double end = timestampsSeconds.back();
    const double start = end - windowSeconds;
    std::size_t count = 0;
    for (const double t : timestampsSeconds)
        if (t >= start)
            ++count;
    return static_cast<double>(count) / windowSeconds;
}
}

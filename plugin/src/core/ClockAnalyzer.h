#pragma once

#include <optional>
#include <span>

namespace miditest
{
std::optional<double> calculateClockBpm(std::span<const double> timestampsSeconds);
double calculateMessageRate(std::span<const double> timestampsSeconds, double windowSeconds = 1.0);
}

#pragma once

#include <cstddef>
#include <optional>
#include <span>

namespace miditest
{
struct PitchStats
{
    std::size_t count = 0;
    int min = 0;
    int max = 0;
    std::optional<int> center;
    std::optional<int> centerSpread;
};

PitchStats analyzePitch(std::span<const int> values);
}

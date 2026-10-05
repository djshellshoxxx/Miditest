#include "core/ClockAnalyzer.h"
#include <cmath>
#include <iostream>
#include <vector>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

int main()
{
    using namespace miditest;
    std::vector<double> ticks;
    const double interval = 60.0 / (120.0 * 24.0);
    for (int i = 0; i < 30; ++i) ticks.push_back(i * interval);
    const auto bpm = calculateClockBpm(ticks);
    CHECK(bpm.has_value());
    CHECK(std::abs(*bpm - 120.0) < 0.01);
    CHECK(!calculateClockBpm(std::vector<double>{0.0, interval}).has_value());

    std::vector<double> rateTimes { 0.0, 0.4, 0.8, 1.0, 1.2 };
    CHECK(std::abs(calculateMessageRate(rateTimes, 1.0) - 4.0) < 0.001);
    CHECK(calculateMessageRate({}, 1.0) == 0.0);
    return failures == 0 ? 0 : 1;
}

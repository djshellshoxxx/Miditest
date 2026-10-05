#include "core/PitchAnalyzer.h"
#include <cmath>
#include <iostream>
#include <vector>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

int main()
{
    using namespace miditest;
    const auto empty = analyzePitch(std::vector<int>{});
    CHECK(empty.count == 0 && !empty.center.has_value());

    std::vector<int> values { -8192, -10, 0, 10, 8191 };
    const auto s = analyzePitch(values);
    CHECK(s.count == 5);
    CHECK(s.min == -8192 && s.max == 8191);
    CHECK(s.center.has_value() && *s.center == 0);
    CHECK(s.centerSpread.has_value() && *s.centerSpread == 8);
    return failures == 0 ? 0 : 1;
}

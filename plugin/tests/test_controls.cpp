#include "core/ControlAnalyzer.h"
#include <iostream>
#include <vector>

static int failures = 0;
#define CHECK(x) do { if (!(x)) { std::cerr << __LINE__ << " CHECK failed: " #x "\n"; ++failures; } } while (0)

int main()
{
    using namespace miditest;
    std::vector<int> values { 0, 1, 2, 20, 19, 21 };
    const auto s = analyzeControl(values);
    CHECK(s.count == 6);
    CHECK(s.min == 0 && s.max == 21 && s.range == 21);
    CHECK(s.unique == 6);
    CHECK(s.jumps == 1);
    CHECK(s.reversals == 2);

    std::vector<int> absolute;
    for (int i = 0; i <= 127; i += 4) absolute.push_back(i);
    CHECK(classifyEncoder(absolute) == "Absolute 0-127");

    std::vector<int> relative { 1, 1, 65, 63, 127, 1, 65, 63, 1, 65 };
    CHECK(classifyEncoder(relative) == "Likely relative encoder");
    CHECK(classifyEncoder(std::vector<int>{1,2,3}) == "Insufficient data");
    return failures == 0 ? 0 : 1;
}

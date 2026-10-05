#pragma once

#include <JuceHeader.h>
#include "../core/SessionModel.h"

namespace miditest
{
class TimingView final : public juce::Component
{
public:
    TimingView();
    void setSnapshot(const SessionSnapshot& snapshot);
    void resized() override;

private:
    juce::Label messageRate;
    juce::Label clock;
    juce::Label transport;
};
}

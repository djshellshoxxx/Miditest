#pragma once

#include <JuceHeader.h>
#include "../core/SessionModel.h"

namespace miditest
{
class ControlsView final : public juce::Component
{
public:
    ControlsView();
    void setSnapshot(const SessionSnapshot& snapshot);
    void resized() override;

private:
    juce::TextEditor summary;
};
}

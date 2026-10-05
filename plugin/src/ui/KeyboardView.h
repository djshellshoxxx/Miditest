#pragma once

#include <JuceHeader.h>
#include "../core/SessionModel.h"

namespace miditest
{
class KeyboardView final : public juce::Component
{
public:
    KeyboardView();
    void setSnapshot(const SessionSnapshot& snapshot);
    void resized() override;

private:
    juce::Label status;
    juce::TextEditor notes;
};
}

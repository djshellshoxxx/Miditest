#pragma once

#include <JuceHeader.h>
#include "../core/MappingModel.h"

namespace miditest
{
class MappingView final : public juce::Component
{
public:
    explicit MappingView(MappingModel& model);
    void refresh();
    void resized() override;

private:
    void saveCurrent();

    MappingModel& model;
    std::optional<LearnResult> current;
    juce::TextButton learnButton { "MIDI Learn" };
    juce::Label learnedLabel;
    juce::TextEditor hardwareLabel;
    juce::TextEditor assignment;
    juce::TextButton saveButton { "Save mapping" };
    juce::TextEditor mappingList;
};
}

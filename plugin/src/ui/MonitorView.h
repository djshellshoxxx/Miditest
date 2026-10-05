#pragma once

#include <JuceHeader.h>
#include "../core/SessionModel.h"
#include <functional>

namespace miditest
{
class MonitorView final : public juce::Component
{
public:
    MonitorView();
    void setSnapshot(const SessionSnapshot& snapshot);
    void setClearCallback(std::function<void()> callback) { onClear = std::move(callback); }
    bool isDisplayPaused() const noexcept { return pauseButton.getToggleState(); }
    void resized() override;

private:
    void rebuildText();
    bool eventMatches(const DecodedMidiEvent&) const;

    SessionSnapshot snapshot;
    juce::ToggleButton pauseButton { "Pause display" };
    juce::TextButton clearButton { "Clear display" };
    juce::ToggleButton autoscrollButton { "Autoscroll" };
    juce::ComboBox typeFilter;
    juce::ComboBox channelFilter;
    juce::TextEditor searchBox;
    juce::TextEditor eventText;
    std::function<void()> onClear;
};
}

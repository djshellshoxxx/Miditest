#pragma once
#include <JuceHeader.h>
#include "PluginProcessor.h"
#include <array>

class MidiTestEditor final : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit MidiTestEditor(MidiTestProcessor&);
    ~MidiTestEditor() override = default;
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    MidiTestProcessor& processor_;
    std::array<juce::TextButton,8> tabs_;
    juce::Label title_, status_, statEvents_, statRate_, statKeys_, statControls_;
    juce::TextEditor body_;
    juce::TextButton reset_{"Clear"}, exportReport_{"Export report"}, exportCsv_{"Export capture"};
    juce::TextButton noteOn_{"Note On"}, noteOff_{"Note Off"}, sendCc_{"Send CC"}, sendProgram_{"Program"}, sendPitch_{"Pitch Bend"}, panic_{"Panic All"};
    juce::Slider channel_, note_, velocity_, cc_, ccValue_, program_, pitch_;
    int activeTab_{0};

    void timerCallback() override;
    void setTab(int);
    void refresh();
    juce::String quickText() const;
    juce::String monitorText() const;
    juce::String controlsText() const;
    juce::String keyboardText() const;
    juce::String timingText() const;
    juce::String outputText() const;
    juce::String mappingText() const;
    juce::String reportText() const;
    void chooseSave(const juce::String& suggested, const juce::String& content);
    static void setupNumber(juce::Slider&, double min, double max, double value);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiTestEditor)
};

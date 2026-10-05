#pragma once

#include <JuceHeader.h>
#include "../PluginProcessor.h"
#include "../core/ReportBuilder.h"

namespace miditest
{
class ReportView final : public juce::Component
{
public:
    explicit ReportView(MidiTestAudioProcessor& processor);
    void setSnapshot(const SessionSnapshot& snapshot);
    void resized() override;

private:
    juce::var currentReport() const;
    void exportJson();

    MidiTestAudioProcessor& processor;
    SessionSnapshot snapshot;
    juce::TextEditor preview;
    juce::TextButton exportButton { "Export JSON…" };
    std::unique_ptr<juce::FileChooser> fileChooser;
};
}

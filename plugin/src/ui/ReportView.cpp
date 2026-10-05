#include "ReportView.h"

namespace miditest
{
ReportView::ReportView(MidiTestAudioProcessor& p) : processor(p)
{
    addAndMakeVisible(preview);
    addAndMakeVisible(exportButton);
    preview.setMultiLine(true);
    preview.setReadOnly(true);
    preview.setFont(juce::Font(juce::FontOptions(13.0f).withName(juce::Font::getDefaultMonospacedFontName())));
    exportButton.onClick = [this] { exportJson(); };
}

juce::var ReportView::currentReport() const
{
    ReportMetadata metadata;
    metadata.version = MIDITEST_VERSION_STRING;
    metadata.pluginFormat = "VST3/CLAP";
    metadata.droppedAnalysisEventCount = processor.getDroppedAnalysisEventCount();
    return buildReport(snapshot, processor.getMappingModel().snapshot(), metadata);
}

void ReportView::setSnapshot(const SessionSnapshot& s)
{
    snapshot = s;
    preview.setText(juce::JSON::toString(currentReport(), true), false);
}

void ReportView::exportJson()
{
    const auto report = currentReport();
    const auto json = juce::JSON::toString(report, true);
    fileChooser = std::make_unique<juce::FileChooser>("Export MIDItest diagnostic report", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("MIDItest-report.json"), "*.json");
    const int flags = juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::warnAboutOverwriting;
    fileChooser->launchAsync(flags, [this, json](const juce::FileChooser& chooser) {
        const auto file = chooser.getResult();
        if (file != juce::File{})
            file.replaceWithText(json);
        fileChooser.reset();
    });
}

void ReportView::resized()
{
    auto area = getLocalBounds().reduced(8);
    exportButton.setBounds(area.removeFromTop(36).removeFromLeft(140).reduced(2));
    preview.setBounds(area.reduced(0, 8));
}
}

#include <JuceHeader.h>
#include "PluginProcessor.h"
#include <iostream>
#include <memory>

int main()
{
    juce::ScopedJuceInitialiser_GUI gui;
    MidiTestAudioProcessor processor;
    std::unique_ptr<juce::AudioProcessorEditor> editor(processor.createEditor());
    if (!editor) return 1;
    if (editor->getWidth() != 1000 || editor->getHeight() != 700)
    {
        std::cerr << "default editor size must be 1000x700\n";
        return 1;
    }
    const auto* constrainer = editor->getConstrainer();
    if (constrainer == nullptr || constrainer->getMinimumWidth() < 720 || constrainer->getMinimumHeight() < 480)
    {
        std::cerr << "minimum editor size must be at least 720x480\n";
        return 1;
    }
    return 0;
}

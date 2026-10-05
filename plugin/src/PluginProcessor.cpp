#include "PluginProcessor.h"
#include "PluginEditor.h"

MidiTestAudioProcessor::MidiTestAudioProcessor()
    : juce::AudioProcessor(BusesProperties()
        .withInput("Input", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    setLatencySamples(0);
}

void MidiTestAudioProcessor::prepareToPlay(double, int) {}
void MidiTestAudioProcessor::releaseResources() {}

bool MidiTestAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    const auto in = layouts.getMainInputChannelSet();
    const auto out = layouts.getMainOutputChannelSet();
    if (in != out)
        return false;
    return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
}

void MidiTestAudioProcessor::processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&)
{
    // Deliberately transparent. Diagnostic observation is added without mutating either buffer.
}

juce::AudioProcessorEditor* MidiTestAudioProcessor::createEditor()
{
    return new MidiTestAudioProcessorEditor(*this);
}

void MidiTestAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ValueTree state("MIDITEST_STATE");
    state.setProperty("schema", 1, nullptr);
    if (auto xml = state.createXml())
        copyXmlToBinary(*xml, destData);
}

void MidiTestAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xml(getXmlFromBinary(data, sizeInBytes));
    if (xml == nullptr)
        return;
    const auto state = juce::ValueTree::fromXml(*xml);
    if (! state.isValid() || ! state.hasType("MIDITEST_STATE"))
        return;
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MidiTestAudioProcessor();
}

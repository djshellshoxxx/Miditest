#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "core/MidiMessageDecoder.h"

MidiTestAudioProcessor::MidiTestAudioProcessor()
    : juce::AudioProcessor(BusesProperties()
        .withInput("Input", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    setLatencySamples(0);
}

void MidiTestAudioProcessor::prepareToPlay(double sampleRate, int)
{
    currentSampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
    processedSamples = 0;
    droppedAnalysisEvents.store(0, std::memory_order_relaxed);
    eventQueue.reset();
}

void MidiTestAudioProcessor::releaseResources() {}

bool MidiTestAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    const auto in = layouts.getMainInputChannelSet();
    const auto out = layouts.getMainOutputChannelSet();
    if (in != out)
        return false;
    return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
}

void MidiTestAudioProcessor::processBlock(juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    juce::ignoreUnused(audio);

    for (const auto metadata : midi)
    {
        const double seconds = static_cast<double>(processedSamples + static_cast<std::uint64_t>(juce::jmax(0, metadata.samplePosition))) / currentSampleRate;
        const auto decoded = miditest::decodeMidiMessage(metadata.getMessage(), metadata.samplePosition, seconds);
        if (! eventQueue.tryPush(decoded))
            droppedAnalysisEvents.fetch_add(1, std::memory_order_relaxed);
    }

    processedSamples += static_cast<std::uint64_t>(juce::jmax(0, audio.getNumSamples()));
    // Audio and MIDI buffers are intentionally untouched.
}

bool MidiTestAudioProcessor::tryPopEvent(miditest::DecodedMidiEvent& event) noexcept
{
    return eventQueue.tryPop(event);
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

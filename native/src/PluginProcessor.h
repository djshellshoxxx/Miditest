#pragma once
#include <JuceHeader.h>
#include "DiagnosticModel.h"
#include <array>
#include <atomic>

class MidiTestProcessor final : public juce::AudioProcessor, private juce::Timer {
public:
    MidiTestProcessor();
    ~MidiTestProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout&) const override { return true; }
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "MIDItest"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    miditest::DiagnosticModel& model() { return model_; }
    const miditest::DiagnosticModel& model() const { return model_; }
    uint64_t droppedInputEvents() const { return droppedInput_.load(); }
    uint64_t droppedOutputEvents() const { return droppedOutput_.load(); }
    void resetDiagnostics();
    void queueShortMessage(uint8_t status, uint8_t a = 0, uint8_t b = 0, uint8_t size = 3);
    void sendNote(int channel, int note, int velocity, bool on);
    void sendCC(int channel, int cc, int value);
    void sendProgram(int channel, int program);
    void sendPitchBend(int channel, int value);
    void panicAll();

private:
    struct QueuedEvent {
        double seconds{};
        uint32_t originalSize{};
        uint16_t storedSize{};
        std::array<uint8_t, 256> bytes{};
    };
    struct OutputEvent {
        uint8_t size{};
        std::array<uint8_t, 3> bytes{};
    };

    static constexpr int queueCapacity = 16384;
    std::array<QueuedEvent, queueCapacity> inputQueue_{};
    std::array<OutputEvent, 1024> outputQueue_{};
    juce::AbstractFifo inputFifo_{queueCapacity};
    juce::AbstractFifo outputFifo_{1024};
    miditest::DiagnosticModel model_;
    std::atomic<uint64_t> droppedInput_{0}, droppedOutput_{0};
    double sampleRate_{44100.0};
    double streamSeconds_{0.0};

    void timerCallback() override;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiTestProcessor)
};

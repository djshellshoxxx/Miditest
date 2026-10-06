#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <algorithm>
#include <cstring>

MidiTestProcessor::MidiTestProcessor() : juce::AudioProcessor(BusesProperties()) {
    startTimerHz(30);
}

void MidiTestProcessor::prepareToPlay(double sampleRate, int) {
    sampleRate_ = sampleRate > 0.0 ? sampleRate : 44100.0;
    streamSeconds_ = 0.0;
}

void MidiTestProcessor::processBlock(juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) {
    audio.clear();
    const auto blockStart = streamSeconds_;
    for (const auto metadata : midi) {
        const auto msg = metadata.getMessage();
        const auto* raw = msg.getRawData();
        const auto size = static_cast<uint32_t>(msg.getRawDataSize());
        auto scope = inputFifo_.write(1);
        if (scope.blockSize1 > 0) {
            auto& q = inputQueue_[static_cast<size_t>(scope.startIndex1)];
            q.seconds = blockStart + static_cast<double>(metadata.samplePosition) / sampleRate_;
            q.originalSize = size;
            q.storedSize = static_cast<uint16_t>(std::min<uint32_t>(size, static_cast<uint32_t>(q.bytes.size())));
            if (q.storedSize) std::memcpy(q.bytes.data(), raw, q.storedSize);
        } else {
            ++droppedInput_;
        }
    }

    for (;;) {
        auto scope = outputFifo_.read(1);
        if (scope.blockSize1 == 0) break;
        const auto& e = outputQueue_[static_cast<size_t>(scope.startIndex1)];
        midi.addEvent(e.bytes.data(), e.size, 0);
    }
    streamSeconds_ += static_cast<double>(audio.getNumSamples()) / sampleRate_;
}

void MidiTestProcessor::timerCallback() {
    for (;;) {
        auto scope = inputFifo_.read(256);
        if (scope.blockSize1 + scope.blockSize2 == 0) break;
        auto consume = [this](int start, int count) {
            for (int i = 0; i < count; ++i) {
                const auto& q = inputQueue_[static_cast<size_t>(start + i)];
                model_.ingest(q.bytes.data(), q.storedSize, q.seconds);
            }
        };
        consume(scope.startIndex1, scope.blockSize1);
        consume(scope.startIndex2, scope.blockSize2);
    }
}

void MidiTestProcessor::resetDiagnostics() {
    model_.reset();
    droppedInput_.store(0);
    droppedOutput_.store(0);
}

void MidiTestProcessor::queueShortMessage(uint8_t status, uint8_t a, uint8_t b, uint8_t size) {
    auto scope = outputFifo_.write(1);
    if (scope.blockSize1 == 0) { ++droppedOutput_; return; }
    auto& e = outputQueue_[static_cast<size_t>(scope.startIndex1)];
    e.size = static_cast<uint8_t>(juce::jlimit(1, 3, static_cast<int>(size)));
    e.bytes = {status, a, b};
}

void MidiTestProcessor::sendNote(int channel, int note, int velocity, bool on) {
    const auto ch = static_cast<uint8_t>(juce::jlimit(1,16,channel)-1);
    queueShortMessage(static_cast<uint8_t>((on ? 0x90 : 0x80) | ch),
                      static_cast<uint8_t>(juce::jlimit(0,127,note)),
                      static_cast<uint8_t>(on ? juce::jlimit(0,127,velocity) : 0), 3);
}
void MidiTestProcessor::sendCC(int channel, int cc, int value) {
    queueShortMessage(static_cast<uint8_t>(0xB0 | (juce::jlimit(1,16,channel)-1)),
                      static_cast<uint8_t>(juce::jlimit(0,127,cc)),
                      static_cast<uint8_t>(juce::jlimit(0,127,value)), 3);
}
void MidiTestProcessor::sendProgram(int channel, int program) {
    queueShortMessage(static_cast<uint8_t>(0xC0 | (juce::jlimit(1,16,channel)-1)),
                      static_cast<uint8_t>(juce::jlimit(0,127,program)), 0, 2);
}
void MidiTestProcessor::sendPitchBend(int channel, int value) {
    const int v = juce::jlimit(-8192,8191,value)+8192;
    queueShortMessage(static_cast<uint8_t>(0xE0 | (juce::jlimit(1,16,channel)-1)),
                      static_cast<uint8_t>(v & 0x7F), static_cast<uint8_t>((v >> 7) & 0x7F), 3);
}
void MidiTestProcessor::panicAll() {
    for (int ch=1; ch<=16; ++ch) { sendCC(ch,120,0); sendCC(ch,121,0); sendCC(ch,123,0); }
}

juce::AudioProcessorEditor* MidiTestProcessor::createEditor() { return new MidiTestEditor(*this); }
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new MidiTestProcessor(); }

#include "PluginEditor.h"
#include <sstream>
#include <iomanip>

namespace {
const juce::StringArray tabNames{"Quick Test","Monitor","Controls","Keyboard","Timing","Output","Mapping","Report"};
juce::String noteName(int n) {
    static const char* names[]={"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};
    return juce::String(names[n%12])+juce::String(n/12-1);
}
}

MidiTestEditor::MidiTestEditor(MidiTestProcessor& p) : AudioProcessorEditor(&p), processor_(p) {
    setResizable(true,true); setResizeLimits(760,520,1800,1200); setSize(1120,720);
    title_.setText("MIDItest",juce::dontSendNotification); title_.setFont(juce::FontOptions(28.0f,juce::Font::bold));
    status_.setColour(juce::Label::textColourId,juce::Colour(0xff9fb2c4));
    for (size_t i=0;i<tabs_.size();++i) { tabs_[i].setButtonText(tabNames[static_cast<int>(i)]); tabs_[i].onClick=[this,i]{setTab(static_cast<int>(i));}; addAndMakeVisible(tabs_[i]); }
    for(auto* c:{static_cast<juce::Component*>(&title_),&status_,&body_,&reset_,&exportReport_,&exportCsv_,&noteOn_,&noteOff_,&sendCc_,&sendProgram_,&sendPitch_,&panic_,&channel_,&note_,&velocity_,&cc_,&ccValue_,&program_,&pitch_}) addAndMakeVisible(c);
    body_.setMultiLine(true); body_.setReadOnly(true); body_.setScrollbarsShown(true); body_.setFont(juce::FontOptions(13.0f).withTypefaceStyle("Regular"));
    for(auto* l:{&statEvents_,&statRate_,&statKeys_,&statControls_}) { addAndMakeVisible(l); l->setJustificationType(juce::Justification::centred); l->setColour(juce::Label::backgroundColourId,juce::Colour(0xff111b26)); }
    setupNumber(channel_,1,16,1); setupNumber(note_,0,127,60); setupNumber(velocity_,0,127,100); setupNumber(cc_,0,127,1); setupNumber(ccValue_,0,127,64); setupNumber(program_,0,127,0); setupNumber(pitch_,-8192,8191,0);
    reset_.onClick=[this]{processor_.resetDiagnostics();refresh();};
    noteOn_.onClick=[this]{processor_.sendNote((int)channel_.getValue(),(int)note_.getValue(),(int)velocity_.getValue(),true);};
    noteOff_.onClick=[this]{processor_.sendNote((int)channel_.getValue(),(int)note_.getValue(),0,false);};
    sendCc_.onClick=[this]{processor_.sendCC((int)channel_.getValue(),(int)cc_.getValue(),(int)ccValue_.getValue());};
    sendProgram_.onClick=[this]{processor_.sendProgram((int)channel_.getValue(),(int)program_.getValue());};
    sendPitch_.onClick=[this]{processor_.sendPitchBend((int)channel_.getValue(),(int)pitch_.getValue());};
    panic_.onClick=[this]{processor_.panicAll();};
    exportReport_.onClick=[this]{chooseSave("miditest-native-report.json",juce::String(processor_.model().reportJson("Host/Standalone MIDI","native")));};
    exportCsv_.onClick=[this]{chooseSave("miditest-native-capture.csv",juce::String(processor_.model().captureCsv()));};
    startTimerHz(12); setTab(0);
}
void MidiTestEditor::setupNumber(juce::Slider& s,double min,double max,double value){s.setRange(min,max,1);s.setValue(value);s.setSliderStyle(juce::Slider::LinearBar);s.setTextBoxStyle(juce::Slider::TextBoxLeft,false,58,22);}
void MidiTestEditor::paint(juce::Graphics& g){g.fillAll(juce::Colour(0xff070b10));g.setColour(juce::Colour(0xff263545));g.drawRect(getLocalBounds(),1);}
void MidiTestEditor::resized(){
    auto r=getLocalBounds().reduced(16);auto top=r.removeFromTop(44);title_.setBounds(top.removeFromLeft(180));status_.setBounds(top);
    auto tabs=r.removeFromTop(38);for(auto& b:tabs_)b.setBounds(tabs.removeFromLeft(juce::jmax(86,tabs.getWidth()/(int)(tabs_.size()))).reduced(2));
    auto stats=r.removeFromTop(64);for(auto* l:{&statEvents_,&statRate_,&statKeys_,&statControls_})l->setBounds(stats.removeFromLeft(stats.getWidth()/4).reduced(4));
    auto actions=r.removeFromBottom(44);reset_.setBounds(actions.removeFromLeft(78).reduced(2));exportReport_.setBounds(actions.removeFromLeft(126).reduced(2));exportCsv_.setBounds(actions.removeFromLeft(126).reduced(2));
    if(activeTab_==5){auto out=r.removeFromBottom(120);auto row1=out.removeFromTop(58);for(auto* s:{&channel_,&note_,&velocity_,&cc_,&ccValue_,&program_,&pitch_})s->setBounds(row1.removeFromLeft(100).reduced(3));auto row2=out.removeFromTop(52);for(auto* b:{&noteOn_,&noteOff_,&sendCc_,&sendProgram_,&sendPitch_,&panic_})b->setBounds(row2.removeFromLeft(112).reduced(3));}
    body_.setBounds(r.reduced(4));
}
void MidiTestEditor::timerCallback(){refresh();}
void MidiTestEditor::setTab(int i){activeTab_=juce::jlimit(0,7,i);for(int n=0;n<8;++n)tabs_[(size_t)n].setToggleState(n==activeTab_,juce::dontSendNotification);const bool out=activeTab_==5;for(auto* c:{static_cast<juce::Component*>(&channel_),&note_,&velocity_,&cc_,&ccValue_,&program_,&pitch_,&noteOn_,&noteOff_,&sendCc_,&sendProgram_,&sendPitch_,&panic_})c->setVisible(out);resized();refresh();}
void MidiTestEditor::refresh(){const auto s=processor_.model().snapshot();statEvents_.setText("EVENTS\n"+juce::String((juce::int64)s.totalEvents),juce::dontSendNotification);statRate_.setText("MSG/SEC\n"+juce::String(s.currentRate,0)+"  peak "+juce::String(s.peakRate,0),juce::dontSendNotification);int keys=0;for(bool v:s.notesSeen)keys+=v?1:0;statKeys_.setText("KEYS\n"+juce::String(keys),juce::dontSendNotification);statControls_.setText("CONTROLS\n"+juce::String((int)s.controlsSeen),juce::dontSendNotification);status_.setText("Input queue drops: "+juce::String((juce::int64)processor_.droppedInputEvents())+"   Output queue drops: "+juce::String((juce::int64)processor_.droppedOutputEvents()),juce::dontSendNotification);juce::String t;switch(activeTab_){case 0:t=quickText();break;case 1:t=monitorText();break;case 2:t=controlsText();break;case 3:t=keyboardText();break;case 4:t=timingText();break;case 5:t=outputText();break;case 6:t=mappingText();break;default:t=reportText();break;}if(body_.getText()!=t)body_.setText(t,false);}
juce::String MidiTestEditor::quickText() const {const auto s=processor_.model().snapshot();juce::String t="QUICK TEST\n\n1. Send every key/pad.\n2. Sweep knobs/faders end to end.\n3. Exercise pitch, modulation, expression and pedals.\n4. Test aftertouch and transport/clock if available.\n5. Review findings and export a report.\n\nOBSERVATIONS\n";if(s.duplicateNoteOns)t<<"• Duplicate Note Ons: "<<(juce::int64)s.duplicateNoteOns<<"\n";if(s.unmatchedNoteOffs)t<<"• Unmatched Note Offs: "<<(juce::int64)s.unmatchedNoteOffs<<"\n";if(s.pitchCenterStdev>100)t<<"• Pitch center spread: "<<s.pitchCenterStdev<<"\n";if(processor_.droppedInputEvents())t<<"• Diagnostic input queue overflowed; reduce traffic or increase queue capacity.\n";if(t.endsWith("OBSERVATIONS\n"))t<<"No suspicious measurements highlighted yet.\n";return t;}
juce::String MidiTestEditor::monitorText() const {auto events=processor_.model().eventsCopy();juce::String t="TIME       TYPE              CH   A    B    VALUE   HEX\n";const size_t start=events.size()>120?events.size()-120:0;for(size_t i=start;i<events.size();++i){const auto&e=events[i];t<<juce::String(e.seconds,3).paddedRight(' ',11)<<juce::String(miditest::kindName(e.kind)).paddedRight(' ',18)<<juce::String(e.channel).paddedRight(' ',5)<<juce::String(e.a).paddedRight(' ',5)<<juce::String(e.b).paddedRight(' ',5)<<juce::String(e.value).paddedRight(' ',8);for(uint16_t n=0;n<e.storedBytes&&n<12;++n)t<<juce::String::toHexString((int)e.bytes[n]).paddedLeft('0',2).toUpperCase()<<" ";if(e.originalBytes>e.storedBytes)t<<"…("<<(int)e.originalBytes<<" bytes)";t<<"\n";}return t;}
juce::String MidiTestEditor::controlsText() const {juce::String t="CONTROL DIAGNOSTICS\n\n";bool any=false;for(int ch=1;ch<=16;++ch)for(int cc=0;cc<128;++cc){const auto c=processor_.model().control(ch,cc);if(!c.count)continue;any=true;t<<"Ch "<<ch<<" CC "<<cc<<"  last "<<c.last<<"  range "<<c.min<<"–"<<c.max<<" ("<<juce::String(c.coverage(),1)<<"%)  unique "<<(int)c.unique.count()<<"  repeated "<<(juce::int64)c.repeated<<"  jumps "<<(juce::int64)c.jumps<<"  reversals "<<(juce::int64)c.reversals<<"  σ "<<juce::String(c.recent.stdev(),2)<<"\n";}if(!any)t<<"Move a CC control to begin profiling.\n";return t;}
juce::String MidiTestEditor::keyboardText() const {const auto s=processor_.model().snapshot();juce::String seen="Seen: ",held="Held: ";int nSeen=0,nHeld=0;for(int n=0;n<128;++n){if(s.notesSeen[(size_t)n]){seen<<noteName(n)<<" ";++nSeen;}if(s.heldNotes[(size_t)n]){held<<noteName(n)<<" ";++nHeld;}}return "KEYBOARD / VELOCITY\n\n"+seen+"\n"+held+"\n\nNotes observed: "+juce::String(nSeen)+"\nHeld now: "+juce::String(nHeld)+"\nDuplicate Note On: "+juce::String((juce::int64)s.duplicateNoteOns)+"\nUnmatched Note Off: "+juce::String((juce::int64)s.unmatchedNoteOffs)+"\n";}
juce::String MidiTestEditor::timingText() const {const auto s=processor_.model().snapshot();return "TIMING / CLOCK\n\nMIDI clock BPM: "+juce::String(s.clockBpm,3)+"\nCurrent message rate: "+juce::String(s.currentRate,1)+" / sec\nPeak message rate: "+juce::String(s.peakRate,1)+" / sec\nPitch range: "+juce::String(s.pitchMin)+" to "+juce::String(s.pitchMax)+"\nPitch near-center mean: "+juce::String(s.pitchCenterMean,2)+"\nPitch near-center spread: "+juce::String(s.pitchCenterStdev,2)+"\n";}
juce::String MidiTestEditor::outputText() const {return "OUTPUT TESTER\n\nSet channel/note/velocity/CC/program/pitch values below, then send controlled messages.\nCLAP sends these to the host MIDI output. Standalone sends them through the active standalone MIDI output route.\nPanic All sends All Sound Off, Reset All Controllers and All Notes Off on all 16 channels.\n";}
juce::String MidiTestEditor::mappingText() const {auto ev=processor_.model().eventsCopy();if(ev.empty())return "MIDI LEARN / MAPPING\n\nWaiting for MIDI…\n";const auto&e=ev.back();return "MIDI LEARN / MAPPING\n\nLast event: "+juce::String(miditest::kindName(e.kind))+" / Channel "+juce::String(e.channel)+" / number "+juce::String(e.a)+" / value "+juce::String(e.value)+"\n\nUse Export capture for a complete CSV mapping worksheet source.\n";}
juce::String MidiTestEditor::reportText() const {return juce::String(processor_.model().reportJson("Host/Standalone MIDI","native"));}
void MidiTestEditor::chooseSave(const juce::String& suggested,const juce::String& content){auto chooser=std::make_shared<juce::FileChooser>("Save MIDItest data",juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile(suggested));chooser->launchAsync(juce::FileBrowserComponent::saveMode|juce::FileBrowserComponent::canSelectFiles,[chooser,content](const juce::FileChooser& fc){const auto f=fc.getResult();if(f!=juce::File{})f.replaceWithText(content);});}

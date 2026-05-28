import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `{formData.dates.map((d, index) => (
                      <div className="grid gap-1.5" key={index}>
                        <Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">
                          Libur Ke-{index + 1}
                        </Label>
                        <div className="relative">
                          {d ? (
                            <div className="flex items-center justify-between field-input text-xs w-full pr-2 text-white">
                              {d.startsWith('BEBAS') ? 'TGL BEBAS' : d}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  const newDates = [...formData.dates];
                                  newDates[index] = "";
                                  setFormData({ ...formData, dates: newDates });
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : showDateSelector.index === index ? (`;

const rep1 = `{formData.dates.map((d, index) => {
                      const isLocked = currentRequests && currentRequests[0] && currentRequests[0].lockedDates && currentRequests[0].lockedDates.includes(d);
                      return (
                      <div className="grid gap-1.5" key={index}>
                        <Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">
                          Libur Ke-{index + 1}
                        </Label>
                        <div className="relative">
                          {d ? (
                            <div className="flex items-center justify-between field-input text-xs w-full pr-2 text-white overflow-hidden">
                              <span className="truncate flex-1">{d.startsWith('BEBAS') ? 'TGL BEBAS' : d}</span>
                              {isLocked ? (
                                <LockIcon className="w-4 h-4 text-rose-400 shrink-0" />
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 shrink-0"
                                  onClick={() => {
                                    const newDates = [...formData.dates];
                                    newDates[index] = "";
                                    setFormData({ ...formData, dates: newDates });
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-white/50" />
                                </Button>
                              )}
                            </div>
                          ) : showDateSelector.index === index ? (`;

content = content.replace(target1, rep1);

// We need to make sure 'd' closure is correctly closed.
const target2 = `                              <Button
                                type="button"
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 px-3 text-[10px]"
                                onClick={() => setShowDateSelector({index: null})}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              onClick={() => setShowDateSelector({index})}
                              className="field-input h-10 w-full flex justify-between items-center text-white/40 group hover:text-white hover:bg-white/5 transition-all text-xs"
                            >
                              <span>Pilih Tanggal</span>
                              <CalendarIcon className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 mt-2">`;
                  
const rep2 = `                              <Button
                                type="button"
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 px-3 text-[10px]"
                                onClick={() => setShowDateSelector({index: null})}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              onClick={() => setShowDateSelector({index})}
                              className="field-input h-10 w-full flex justify-between items-center text-white/40 group hover:text-white hover:bg-white/5 transition-all text-xs"
                            >
                              <span>Pilih Tanggal</span>
                              <CalendarIcon className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                  <div className="space-y-2 mt-2">`;
content = content.replace(target2, rep2);

fs.writeFileSync('src/App.tsx', content);

